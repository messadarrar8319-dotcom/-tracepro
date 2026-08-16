"""Iteration 4 backend tests: control signature, correction+audit endpoint,
global dossier PDF export. Company isolation verified for all new endpoints."""
import uuid
import pytest


def _register(session, base_url, prefix="TEST_iso4"):
    email = f"{prefix}_{uuid.uuid4().hex[:6]}@tracepro.fr"
    r = session.post(f"{base_url}/api/auth/register", json={
        "company_name": f"CO_{prefix}", "business_type": "boucherie",
        "manager_name": "M", "address": "a", "phone": "1",
        "email": email, "password": "password123",
    })
    assert r.status_code == 200, r.text
    tok = r.json()["access_token"]
    return {"email": email, "token": tok,
            "org_id": r.json()["organization"]["id"],
            "headers": {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}}


# ==================== CONTROL SIGNATURE ====================
class TestControlSignature:
    def test_temperature_has_signature(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/temperatures", headers=responsable_headers, json={
            "zone": "SIGT", "zone_type": "chambre_froide",
            "temperature": 3.5, "conforming": True,
        })
        assert r.status_code == 200
        doc = r.json()
        assert "signature" in doc and doc["signature"], "signature missing"
        sig = doc["signature"]
        for k in ("user_id", "user_name", "org_id", "control_type", "signed_at", "status"):
            assert k in sig, f"signature missing key {k}"
        assert sig["control_type"] == "temperature"
        assert sig["user_id"] == doc["created_by"]
        assert sig["org_id"] == doc["org_id"]

    def test_cleaning_has_signature(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/cleaning", headers=responsable_headers, json={
            "zone": "SIGC", "operation_type": "desinfection",
        })
        assert r.status_code == 200
        sig = r.json().get("signature") or {}
        assert sig.get("control_type") == "cleaning"
        assert sig.get("user_id")
        assert sig.get("user_name")

    def test_signature_persists_in_list(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        session.post(f"{base_url}/api/temperatures", headers=responsable_headers, json={
            "client_id": cid, "zone": "SIGP", "zone_type": "chambre_froide",
            "temperature": 4.0, "conforming": True,
        })
        lst = session.get(f"{base_url}/api/temperatures", headers=responsable_headers).json()
        target = next((x for x in lst if x["id"] == cid), None)
        assert target is not None
        assert target.get("signature") and target["signature"].get("control_type") == "temperature"

    def test_offline_idempotency_preserves_signature(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        p = {"client_id": cid, "zone": "SIGI", "zone_type": "chambre_froide",
             "temperature": 4.0, "conforming": True}
        r1 = session.post(f"{base_url}/api/temperatures", headers=responsable_headers, json=p)
        r2 = session.post(f"{base_url}/api/temperatures", headers=responsable_headers, json=p)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]
        assert r1.json().get("signature") == r2.json().get("signature")


# ==================== CORRECTION + AUDIT ====================
class TestCorrectionAndAudit:
    @pytest.fixture
    def temp_record(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/temperatures", headers=responsable_headers, json={
            "zone": "CORR", "zone_type": "chambre_froide",
            "temperature": 6.0, "conforming": False,
        })
        assert r.status_code == 200
        return r.json()

    def test_correct_temperature_ok(self, session, base_url, responsable_headers, temp_record):
        cid = temp_record["id"]
        r = session.post(f"{base_url}/api/controls/temperatures/{cid}/correct",
                         headers=responsable_headers,
                         json={"changes": {"temperature": 4.0, "conforming": True},
                               "reason": "Erreur de saisie"})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        assert r.json().get("audit_id")

        # verify record has corrected=true and new values applied
        lst = session.get(f"{base_url}/api/temperatures", headers=responsable_headers).json()
        updated = next(x for x in lst if x["id"] == cid)
        assert updated.get("corrected") is True
        assert updated.get("temperature") == 4.0
        assert updated.get("conforming") is True
        # signature preserved (immutable)
        assert updated.get("signature", {}).get("control_type") == "temperature"

    def test_audit_history_returned(self, session, base_url, responsable_headers, temp_record):
        cid = temp_record["id"]
        session.post(f"{base_url}/api/controls/temperatures/{cid}/correct",
                     headers=responsable_headers,
                     json={"changes": {"temperature": 2.5}, "reason": "Recalibrage"})
        r = session.get(f"{base_url}/api/controls/temperatures/{cid}/audit",
                        headers=responsable_headers)
        assert r.status_code == 200
        history = r.json()
        assert isinstance(history, list) and len(history) >= 1
        entry = history[0]
        for k in ("old_values", "new_values", "reason", "changed_by", "changed_at"):
            assert k in entry
        assert entry["new_values"].get("temperature") == 2.5

    def test_correct_employee_forbidden(self, session, base_url, responsable_headers,
                                        new_employee, temp_record):
        cid = temp_record["id"]
        r = session.post(f"{base_url}/api/controls/temperatures/{cid}/correct",
                         headers=new_employee["headers"],
                         json={"changes": {"temperature": 1.0}, "reason": "test"})
        assert r.status_code == 403

    def test_invalid_ctype_400(self, session, base_url, responsable_headers, temp_record):
        r = session.post(f"{base_url}/api/controls/nope/{temp_record['id']}/correct",
                         headers=responsable_headers,
                         json={"changes": {"foo": "bar"}, "reason": "x"})
        assert r.status_code == 400

    def test_protected_fields_rejected(self, session, base_url, responsable_headers, temp_record):
        """When ALL provided changes are protected -> 400 'aucune modification autorisée'."""
        cid = temp_record["id"]
        r = session.post(f"{base_url}/api/controls/temperatures/{cid}/correct",
                         headers=responsable_headers,
                         json={"changes": {"id": "x", "org_id": "y", "signature": {}},
                               "reason": "hack"})
        assert r.status_code == 400

    def test_missing_reason_422(self, session, base_url, responsable_headers, temp_record):
        r = session.post(f"{base_url}/api/controls/temperatures/{temp_record['id']}/correct",
                         headers=responsable_headers,
                         json={"changes": {"temperature": 1.0}})
        assert r.status_code == 422

    def test_empty_reason_422(self, session, base_url, responsable_headers, temp_record):
        r = session.post(f"{base_url}/api/controls/temperatures/{temp_record['id']}/correct",
                         headers=responsable_headers,
                         json={"changes": {"temperature": 1.0}, "reason": ""})
        assert r.status_code == 422

    def test_correct_nonexistent_404(self, session, base_url, responsable_headers):
        r = session.post(f"{base_url}/api/controls/temperatures/no-such-id/correct",
                         headers=responsable_headers,
                         json={"changes": {"temperature": 1.0}, "reason": "x"})
        assert r.status_code == 404

    def test_correct_cleaning(self, session, base_url, responsable_headers):
        c = session.post(f"{base_url}/api/cleaning", headers=responsable_headers, json={
            "zone": "CLNCORR", "operation_type": "desinfection",
        }).json()
        r = session.post(f"{base_url}/api/controls/cleaning/{c['id']}/correct",
                         headers=responsable_headers,
                         json={"changes": {"zone": "CLNCORR_FIXED"}, "reason": "typo"})
        assert r.status_code == 200

    def test_cross_org_correct_404(self, session, base_url):
        """Manager of org A cannot correct org B's record."""
        org_a = _register(session, base_url, prefix="TEST_isoA4")
        org_b = _register(session, base_url, prefix="TEST_isoB4")
        # Org B creates a temperature
        b_temp = session.post(f"{base_url}/api/temperatures", headers=org_b["headers"], json={
            "zone": "BX", "zone_type": "chambre_froide",
            "temperature": 5.0, "conforming": True,
        }).json()
        # Org A tries to correct it
        r = session.post(f"{base_url}/api/controls/temperatures/{b_temp['id']}/correct",
                         headers=org_a["headers"],
                         json={"changes": {"temperature": 0.0}, "reason": "malicious"})
        assert r.status_code == 404


# ==================== DOSSIER PDF ====================
class TestDossierPdf:
    def test_dossier_default_ok(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/export/dossier", headers=responsable_headers)
        assert r.status_code == 200, r.text
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF"

    def test_dossier_with_date_range(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/export/dossier",
                        headers=responsable_headers,
                        params={"date_from": "2026-01-01", "date_to": "2026-12-31"})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_dossier_subset_sections(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/export/dossier",
                        headers=responsable_headers,
                        params={"sections": "temperatures,cleaning"})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"

    def test_dossier_employee_forbidden(self, session, base_url, new_employee):
        r = session.get(f"{base_url}/api/export/dossier", headers=new_employee["headers"])
        assert r.status_code == 403

    def test_dossier_company_isolated(self, session, base_url):
        """Org A dossier should NOT include any of org B's product names."""
        org_a = _register(session, base_url, prefix="TEST_dosA")
        org_b = _register(session, base_url, prefix="TEST_dosB")
        unique_b = f"BONLY_{uuid.uuid4().hex[:8]}"
        # Org B creates a reception & temperature
        session.post(f"{base_url}/api/receptions", headers=org_b["headers"], json={
            "supplier": unique_b, "product": unique_b, "batch_number": f"BB{uuid.uuid4().hex[:6]}",
            "reception_date": "2026-01-15", "quantity": 1, "unit": "kg",
        })
        # Org A generates dossier
        r = session.get(f"{base_url}/api/export/dossier",
                        headers=org_a["headers"],
                        params={"sections": "receptions,temperatures,cleaning,non_conformities,losses"})
        assert r.status_code == 200
        assert r.content[:4] == b"%PDF"
        # PDF binary should not contain org B's unique supplier name
        assert unique_b.encode("utf-8") not in r.content
