"""Tests for the Stripe web billing endpoints and webhook.

Covers:
- POST /api/billing/checkout — manager only (403 for employee)
- GET  /api/billing/status/{session_id} — 403 when metadata.app_org_id != caller org
- POST /api/stripe/webhook — checkout.session.completed marks org trialing / has_access true; idempotent
- POST /api/subscription/cancel — sets cancel_at_period_end true, keeps access
- GET  /api/auth/me — has_access transitions after webhook activation
"""
import os
import uuid
import pytest


ORIGIN = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://food-traceability-1.preview.emergentagent.com").rstrip("/")


def _register(session, base_url, prefix="bill"):
    email = f"TEST_{prefix}_{uuid.uuid4().hex[:6]}@tracepro.fr"
    payload = {
        "company_name": f"TEST Co {prefix}", "business_type": "boucherie",
        "manager_name": "TEST Manager", "address": "1 rue Test",
        "phone": "0102030405", "email": email, "password": "password123",
    }
    r = session.post(f"{base_url}/api/auth/register", json=payload)
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "email": email,
        "token": data["access_token"],
        "user_id": data["user"]["id"],
        "org_id": data["organization"]["id"],
        "headers": {"Authorization": f"Bearer {data['access_token']}", "Content-Type": "application/json"},
    }


# =========== POST /billing/checkout ===========
class TestBillingCheckout:
    def test_manager_checkout_returns_url_and_session(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/billing/checkout",
                         json={"origin": ORIGIN}, headers=responsable_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("url"), f"Missing url in response: {data}"
        assert data.get("session_id"), f"Missing session_id: {data}"
        assert data["url"].startswith("http")
        assert data["session_id"].startswith("cs_")

    def test_employee_forbidden(self, session, base_url):
        # Create a fresh manager + invite an employee so we don't depend on shared fixtures
        mgr = _register(session, base_url, prefix="chkmgr")
        emp_email = f"TEST_chkemp_{uuid.uuid4().hex[:6]}@tracepro.fr"
        inv = session.post(
            f"{base_url}/api/users/invite",
            json={"name": "TEST Emp", "email": emp_email, "password": "employee123", "role": "employe"},
            headers=mgr["headers"],
        )
        assert inv.status_code == 200, inv.text
        login = session.post(
            f"{base_url}/api/auth/login",
            json={"email": emp_email, "password": "employee123"},
        )
        assert login.status_code == 200
        emp_h = {"Authorization": f"Bearer {login.json()['access_token']}", "Content-Type": "application/json"}
        r = session.post(f"{base_url}/api/billing/checkout",
                         json={"origin": ORIGIN}, headers=emp_h)
        assert r.status_code == 403, f"Expected 403 for employee, got {r.status_code}: {r.text}"


# =========== GET /billing/status/{session_id} ===========
class TestBillingStatus:
    def test_cross_org_session_forbidden(self, session, base_url, responsable_headers):
        # Create a session as a fresh registered manager
        other = _register(session, base_url, prefix="statx")
        r = session.post(f"{base_url}/api/billing/checkout",
                         json={"origin": ORIGIN}, headers=other["headers"])
        assert r.status_code == 200, r.text
        sess_id = r.json()["session_id"]
        # Now query it from the seeded responsable (different org) → should be 403
        r2 = session.get(f"{base_url}/api/billing/status/{sess_id}", headers=responsable_headers)
        assert r2.status_code == 403, f"Expected 403 cross-org, got {r2.status_code}: {r2.text}"

    def test_status_own_session_ok(self, session, base_url):
        u = _register(session, base_url, prefix="stato")
        r = session.post(f"{base_url}/api/billing/checkout",
                         json={"origin": ORIGIN}, headers=u["headers"])
        assert r.status_code == 200
        sess_id = r.json()["session_id"]
        r2 = session.get(f"{base_url}/api/billing/status/{sess_id}", headers=u["headers"])
        assert r2.status_code == 200, r2.text
        # Should return a subscription-like dict
        body = r2.json()
        assert "state" in body and "has_access" in body


# =========== POST /stripe/webhook ===========
class TestStripeWebhook:
    def test_webhook_activates_org_and_is_idempotent(self, session, base_url):
        u = _register(session, base_url, prefix="wh")
        # 1) Sanity: /me shows has_access=false
        me = session.get(f"{base_url}/api/auth/me", headers=u["headers"]).json()
        assert me["subscription"]["has_access"] is False
        assert me["subscription"]["state"] == "inactif"

        # 2) Send webhook: checkout.session.completed
        event_id = f"evt_test_{uuid.uuid4().hex[:12]}"
        payload = {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": f"cs_test_{uuid.uuid4().hex[:12]}",
                "status": "complete",
                "customer": f"cus_test_{uuid.uuid4().hex[:8]}",
                "subscription": f"sub_test_{uuid.uuid4().hex[:8]}",
                "metadata": {"app_org_id": u["org_id"], "app_user_id": u["user_id"]},
            }},
        }
        r = session.post(f"{base_url}/api/stripe/webhook", json=payload)
        assert r.status_code == 200, r.text
        assert r.json().get("received") is True

        # 3) /me now has has_access=true, state='essai'
        me2 = session.get(f"{base_url}/api/auth/me", headers=u["headers"]).json()
        assert me2["subscription"]["has_access"] is True, me2["subscription"]
        assert me2["subscription"]["state"] == "essai", me2["subscription"]

        # 4) Idempotency: same event_id again → 200 received, no error
        r2 = session.post(f"{base_url}/api/stripe/webhook", json=payload)
        assert r2.status_code == 200, r2.text
        assert r2.json().get("received") is True


# =========== POST /subscription/cancel ===========
class TestSubscriptionCancel:
    def test_cancel_sets_flag_and_keeps_access(self, session, base_url):
        u = _register(session, base_url, prefix="canc")
        # Activate via webhook first
        event_id = f"evt_test_{uuid.uuid4().hex[:12]}"
        session.post(f"{base_url}/api/stripe/webhook", json={
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {"object": {
                "id": f"cs_test_{uuid.uuid4().hex[:12]}",
                "status": "complete",
                "customer": f"cus_test_{uuid.uuid4().hex[:8]}",
                "subscription": f"sub_test_{uuid.uuid4().hex[:8]}",
                "metadata": {"app_org_id": u["org_id"], "app_user_id": u["user_id"]},
            }},
        })
        # Cancel
        r = session.post(f"{base_url}/api/subscription/cancel", headers=u["headers"])
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("cancel_at_period_end") is True
        # Access is preserved while period end is in the future (trial_end is +15 days)
        assert body.get("has_access") is True, body

        # Confirm via /auth/me too
        me = session.get(f"{base_url}/api/auth/me", headers=u["headers"]).json()
        assert me["subscription"]["cancel_at_period_end"] is True
        assert me["subscription"]["has_access"] is True

    def test_cancel_forbidden_for_employee(self, session, base_url):
        # Fresh manager+employee so we don't rely on shared fixtures that other tests may delete
        mgr = _register(session, base_url, prefix="cancmgr")
        emp_email = f"TEST_cancemp_{uuid.uuid4().hex[:6]}@tracepro.fr"
        inv = session.post(
            f"{base_url}/api/users/invite",
            json={"name": "TEST Emp", "email": emp_email, "password": "employee123", "role": "employe"},
            headers=mgr["headers"],
        )
        assert inv.status_code == 200, inv.text
        login = session.post(
            f"{base_url}/api/auth/login",
            json={"email": emp_email, "password": "employee123"},
        )
        assert login.status_code == 200
        emp_h = {"Authorization": f"Bearer {login.json()['access_token']}", "Content-Type": "application/json"}
        r = session.post(f"{base_url}/api/subscription/cancel", headers=emp_h)
        assert r.status_code == 403, r.text
