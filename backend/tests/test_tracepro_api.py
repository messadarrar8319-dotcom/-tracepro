"""End-to-end backend regression tests for TRACEPRO."""
import uuid
import time
import pytest
from datetime import datetime, timedelta


# ==================== AUTH ====================
class TestAuth:
    def test_login_returns_token(self, session, base_url):
        r = session.post(f"{base_url}/api/auth/login",
                         json={"email": "test@tracepro.fr", "password": "password123"})
        assert r.status_code == 200
        data = r.json()
        assert "access_token" in data
        assert data["user"]["email"] == "test@tracepro.fr"
        assert data["user"]["role"] == "responsable"
        assert data["organization"] is not None

    def test_login_wrong_password(self, session, base_url):
        r = session.post(f"{base_url}/api/auth/login",
                         json={"email": "test@tracepro.fr", "password": "wrong"})
        assert r.status_code == 401

    def test_me_endpoint(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/auth/me", headers=responsable_headers)
        assert r.status_code == 200
        data = r.json()
        assert "user" in data and "organization" in data and "subscription" in data
        assert data["subscription"]["state"] in ("essai", "actif", "past_due", "expire")

    def test_me_unauthenticated(self, session, base_url):
        r = session.get(f"{base_url}/api/auth/me")
        assert r.status_code == 401

    def test_register_creates_trial(self, session, base_url):
        email = f"TEST_reg_{uuid.uuid4().hex[:6]}@tracepro.fr"
        payload = {
            "company_name": "TEST Co", "business_type": "boucherie",
            "manager_name": "TEST Manager", "address": "1 rue Test",
            "phone": "0102030405", "email": email, "password": "password123",
        }
        r = session.post(f"{base_url}/api/auth/register", json=payload)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["role"] == "responsable"
        assert data["organization"]["stripe_status"] == "trialing"
        assert data["organization"]["trial_end"] is not None

    def test_register_duplicate_email(self, session, base_url):
        r = session.post(f"{base_url}/api/auth/register", json={
            "company_name": "X", "business_type": "b", "manager_name": "X",
            "address": "x", "phone": "1", "email": "test@tracepro.fr", "password": "password123",
        })
        assert r.status_code == 409

    def test_forgot_and_reset(self, session, base_url):
        # register a fresh account
        email = f"TEST_rst_{uuid.uuid4().hex[:6]}@tracepro.fr"
        session.post(f"{base_url}/api/auth/register", json={
            "company_name": "T", "business_type": "b", "manager_name": "T",
            "address": "a", "phone": "1", "email": email, "password": "password123",
        })
        f = session.post(f"{base_url}/api/auth/forgot-password", json={"email": email})
        assert f.status_code == 200
        token = f.json().get("dev_token")
        assert token, "dev_token missing"
        rp = session.post(f"{base_url}/api/auth/reset-password",
                          json={"token": token, "new_password": "newpassword"})
        assert rp.status_code == 200
        lr = session.post(f"{base_url}/api/auth/login",
                          json={"email": email, "password": "newpassword"})
        assert lr.status_code == 200


# ==================== DASHBOARD & SUBSCRIPTION ====================
class TestDashboard:
    def test_dashboard_shape(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/dashboard", headers=responsable_headers)
        assert r.status_code == 200
        d = r.json()
        for k in ("receptions_today", "active_batches", "dlc_soon",
                  "dlc_expired", "temp_non_conformes", "non_conformites_open",
                  "losses_count", "notifications", "week", "month"):
            assert k in d, f"missing key {k}"

    def test_subscription_status(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/subscription/status", headers=responsable_headers)
        assert r.status_code == 200
        assert "state" in r.json()
        assert "has_access" in r.json()


# ==================== RECEPTIONS + BATCH ====================
class TestReceptions:
    def test_create_list_get_reception(self, session, base_url, responsable_headers):
        batch = f"TESTB{uuid.uuid4().hex[:6]}"
        payload = {
            "supplier": "TEST Fournisseur", "product": "TEST Boeuf",
            "reference": "REF-1", "batch_number": batch,
            "reception_date": "2026-01-15",
            "dlc": (datetime.utcnow() + timedelta(days=5)).strftime("%Y-%m-%d"),
            "quantity": 10.5, "unit": "kg", "temperature": 3.5,
            "conforming": True, "comment": "test",
        }
        c = session.post(f"{base_url}/api/receptions", json=payload, headers=responsable_headers)
        assert c.status_code == 200, c.text
        rid = c.json()["id"]
        assert c.json()["batch_number"] == batch

        # GET one
        g = session.get(f"{base_url}/api/receptions/{rid}", headers=responsable_headers)
        assert g.status_code == 200
        assert g.json()["batch_number"] == batch

        # List
        lst = session.get(f"{base_url}/api/receptions", headers=responsable_headers)
        assert lst.status_code == 200
        assert any(r["id"] == rid for r in lst.json())

        # Traceability card
        b = session.get(f"{base_url}/api/batches/{batch}", headers=responsable_headers)
        assert b.status_code == 200
        bd = b.json()
        assert bd["total_received"] == 10.5
        assert bd["remaining"] == 10.5
        assert len(bd["timeline"]) >= 1

    def test_batch_not_found(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/batches/NOPE_{uuid.uuid4().hex[:6]}", headers=responsable_headers)
        assert r.status_code == 404


# ==================== TEMPS / CLEANING / NC / LOSSES ====================
class TestOtherEntities:
    def test_temperature_flow(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/temperatures", headers=responsable_headers,
                         json={"zone": "Chambre A", "zone_type": "chambre_froide",
                               "temperature": 4.0, "conforming": True})
        assert r.status_code == 200
        lst = session.get(f"{base_url}/api/temperatures", headers=responsable_headers)
        assert lst.status_code == 200 and len(lst.json()) >= 1

    def test_cleaning_flow(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/cleaning", headers=responsable_headers,
                         json={"zone": "Cuisine", "operation_type": "desinfection"})
        assert r.status_code == 200
        lst = session.get(f"{base_url}/api/cleaning", headers=responsable_headers)
        assert lst.status_code == 200 and len(lst.json()) >= 1

    def test_non_conformity_flow(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/non-conformities", headers=responsable_headers,
                         json={"problem_type": "temperature", "concerned_item": "Chambre A",
                               "description": "Test NC"})
        assert r.status_code == 200
        nid = r.json()["id"]
        # PATCH status (query param)
        p = session.patch(f"{base_url}/api/non-conformities/{nid}?status=resolue",
                         headers=responsable_headers)
        assert p.status_code == 200, p.text
        lst = session.get(f"{base_url}/api/non-conformities", headers=responsable_headers)
        assert lst.status_code == 200
        found = next((n for n in lst.json() if n["id"] == nid), None)
        assert found and found["status"] == "resolue"

    def test_losses_flow(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/losses", headers=responsable_headers,
                         json={"product": "TEST Prod", "quantity": 2.0, "unit": "kg",
                               "reason": "casse", "estimated_value": 15.0})
        assert r.status_code == 200
        lst = session.get(f"{base_url}/api/losses", headers=responsable_headers)
        assert lst.status_code == 200


# ==================== SEARCH / ARCHIVES / EXPORT ====================
class TestSearchAndExport:
    def test_search(self, session, base_url, responsable_headers):
        # Ensure at least one reception
        batch = f"TESTS{uuid.uuid4().hex[:6]}"
        session.post(f"{base_url}/api/receptions", headers=responsable_headers, json={
            "supplier": "SearchSup", "product": "SearchProd", "batch_number": batch,
            "reception_date": "2026-01-15", "quantity": 1, "unit": "kg",
        })
        r = session.get(f"{base_url}/api/search", params={"q": batch}, headers=responsable_headers)
        assert r.status_code == 200
        d = r.json()
        assert any(rec["batch_number"] == batch for rec in d["receptions"])
        assert any(b["batch_number"] == batch for b in d["batches"])

    def test_archives(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/archives", headers=responsable_headers)
        assert r.status_code == 200
        for k in ("receptions", "temperatures", "cleaning", "non_conformities", "losses"):
            assert k in r.json()

    def test_pdf_export(self, session, base_url, responsable_headers):
        batch = f"TESTP{uuid.uuid4().hex[:6]}"
        session.post(f"{base_url}/api/receptions", headers=responsable_headers, json={
            "supplier": "S", "product": "P", "batch_number": batch,
            "reception_date": "2026-01-15", "quantity": 5, "unit": "kg",
        })
        r = session.get(f"{base_url}/api/export/batch/{batch}", headers=responsable_headers)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF"


# ==================== USERS + ROLES ====================
class TestUsersAndRoles:
    def test_list_users(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/users", headers=responsable_headers)
        assert r.status_code == 200
        assert any(u["email"] == "test@tracepro.fr" for u in r.json())

    def test_invite_and_role_enforcement(self, session, base_url, new_employee):
        # Employee should NOT be able to invite (403)
        r = session.post(f"{base_url}/api/users/invite", headers=new_employee["headers"],
                         json={"name": "X", "email": f"TEST_x_{uuid.uuid4().hex[:5]}@t.fr",
                               "password": "password123"})
        assert r.status_code == 403

    def test_employee_cannot_subscribe(self, session, base_url, new_employee):
        r = session.post(f"{base_url}/api/subscription/subscribe", headers=new_employee["headers"])
        assert r.status_code == 403

    def test_delete_user(self, session, base_url, responsable_headers, new_employee):
        r = session.delete(f"{base_url}/api/users/{new_employee['id']}", headers=responsable_headers)
        assert r.status_code == 200


# ==================== SUBSCRIPTION MUTATIONS ====================
class TestSubscription:
    def test_subscribe_then_cancel(self, session, base_url):
        # Use a fresh account to avoid affecting main test user
        email = f"TEST_sub_{uuid.uuid4().hex[:6]}@tracepro.fr"
        session.post(f"{base_url}/api/auth/register", json={
            "company_name": "SubCo", "business_type": "b", "manager_name": "M",
            "address": "a", "phone": "1", "email": email, "password": "password123",
        })
        tok = session.post(f"{base_url}/api/auth/login",
                           json={"email": email, "password": "password123"}).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        r = session.post(f"{base_url}/api/subscription/subscribe", headers=h)
        assert r.status_code == 200
        assert r.json()["state"] == "actif"
        assert r.json()["has_access"] is True

        c = session.post(f"{base_url}/api/subscription/cancel", headers=h)
        assert c.status_code == 200
        # After cancel: if trial still valid, state=essai; else expire. Both acceptable.
        assert c.json()["state"] in ("expire", "actif", "essai")


# ==================== FILE UPLOAD ====================
class TestFiles:
    def test_upload_and_download(self, base_url, responsable_token):
        # multipart upload requires a fresh session (no JSON Content-Type)
        import requests as _rq
        h = {"Authorization": f"Bearer {responsable_token}"}
        files = {"file": ("test.txt", b"hello tracepro", "text/plain")}
        r = _rq.post(f"{base_url}/api/files/upload", headers=h, files=files)
        assert r.status_code == 200, r.text
        path = r.json()["path"]
        assert path.startswith("tracepro/uploads/")
        # download
        d = _rq.get(f"{base_url}/api/files/{path}", headers=h)
        assert d.status_code == 200
        assert d.content == b"hello tracepro"
