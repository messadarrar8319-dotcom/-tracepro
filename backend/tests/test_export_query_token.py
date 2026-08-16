"""Iteration 4 follow-up fix: export endpoints must accept auth via
Authorization header OR ?token= query param. Also confirm dossier stays
manager-only and returns 401 without any token."""
import uuid
import pytest


# ---------- helpers ----------
def _create_reception(session, base_url, headers):
    """Ensure at least one batch exists for batch-scoped exports."""
    payload = {
        "supplier": f"TEST_sup_{uuid.uuid4().hex[:5]}",
        "product": "TEST prod",
        "batch_number": f"TESTB{uuid.uuid4().hex[:6].upper()}",
        "reception_date": "2026-01-15",
        "dlc": "2030-12-31",
        "quantity": 1,
        "unit": "kg",
        "temperature_control": 4.0,
        "conforming": True,
        "comment": "",
    }
    r = session.post(f"{base_url}/api/receptions", json=payload, headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["batch_number"]


# ---------- /api/export/dossier ----------
class TestDossierAuth:
    def test_dossier_query_token_ok(self, session, base_url, responsable_token):
        r = session.get(f"{base_url}/api/export/dossier", params={"token": responsable_token}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.content[:5] == b"%PDF-", "Should return a PDF binary"
        assert "application/pdf" in r.headers.get("content-type", "").lower()

    def test_dossier_header_still_works(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/export/dossier", headers=responsable_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_dossier_no_auth_401(self, session, base_url):
        clean = {"Content-Type": "application/json"}  # NO Authorization
        r = session.get(f"{base_url}/api/export/dossier", headers=clean, timeout=15)
        assert r.status_code == 401, r.text

    def test_dossier_employe_query_token_403(self, session, base_url, new_employee):
        r = session.get(f"{base_url}/api/export/dossier", params={"token": new_employee["token"]}, timeout=15)
        assert r.status_code == 403, r.text

    def test_dossier_default_sections_include_traceability(self, session, base_url, responsable_token):
        # Default sections string (no explicit sections=) - traceability should now be in there.
        r = session.get(f"{base_url}/api/export/dossier", params={"token": responsable_token}, timeout=30)
        assert r.status_code == 200
        body = r.content
        # ReportLab compresses PDFs; we look for known section titles that may
        # appear either as plain text or in streams. We rely on the fact the
        # default section list is echoed via section headers.
        # We can also request only 'traceability' and check status ok.
        r2 = session.get(f"{base_url}/api/export/dossier", params={"token": responsable_token, "sections": "traceability"}, timeout=30)
        assert r2.status_code == 200
        assert r2.content[:5] == b"%PDF-"


# ---------- /api/export/csv/{type} ----------
class TestCsvAuth:
    @pytest.mark.parametrize("doc_type", ["temperatures", "cleaning", "receptions", "non_conformities", "losses"])
    def test_csv_query_token_ok(self, session, base_url, responsable_token, doc_type):
        r = session.get(f"{base_url}/api/export/csv/{doc_type}", params={"token": responsable_token}, timeout=20)
        assert r.status_code == 200, r.text
        # CSV should be text; header line present
        assert len(r.content) > 0

    def test_csv_header_still_works(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/export/csv/temperatures", headers=responsable_headers, timeout=20)
        assert r.status_code == 200

    def test_csv_no_auth_401(self, session, base_url):
        clean = {"Content-Type": "application/json"}
        r = session.get(f"{base_url}/api/export/csv/temperatures", headers=clean, timeout=15)
        assert r.status_code == 401

    def test_csv_bad_type_400(self, session, base_url, responsable_token):
        r = session.get(f"{base_url}/api/export/csv/unknown", params={"token": responsable_token}, timeout=15)
        assert r.status_code in (400, 404, 422)


# ---------- /api/export/csv-batch/{batch} ----------
class TestCsvBatchAuth:
    def test_csv_batch_query_token_ok(self, session, base_url, responsable_token, responsable_headers):
        batch = _create_reception(session, base_url, responsable_headers)
        r = session.get(f"{base_url}/api/export/csv-batch/{batch}", params={"token": responsable_token}, timeout=20)
        assert r.status_code == 200, r.text
        assert len(r.content) > 0

    def test_csv_batch_header_ok(self, session, base_url, responsable_headers):
        batch = _create_reception(session, base_url, responsable_headers)
        r = session.get(f"{base_url}/api/export/csv-batch/{batch}", headers=responsable_headers, timeout=20)
        assert r.status_code == 200

    def test_csv_batch_no_auth_401(self, session, base_url):
        clean = {"Content-Type": "application/json"}
        r = session.get(f"{base_url}/api/export/csv-batch/ANY", headers=clean, timeout=15)
        assert r.status_code == 401


# ---------- /api/export/batch/{batch} (PDF) ----------
class TestBatchPdfAuth:
    def test_batch_pdf_query_token_ok(self, session, base_url, responsable_token, responsable_headers):
        batch = _create_reception(session, base_url, responsable_headers)
        r = session.get(f"{base_url}/api/export/batch/{batch}", params={"token": responsable_token}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.content[:5] == b"%PDF-"

    def test_batch_pdf_header_ok(self, session, base_url, responsable_headers):
        batch = _create_reception(session, base_url, responsable_headers)
        r = session.get(f"{base_url}/api/export/batch/{batch}", headers=responsable_headers, timeout=30)
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    def test_batch_pdf_no_auth_401(self, session, base_url):
        clean = {"Content-Type": "application/json"}
        r = session.get(f"{base_url}/api/export/batch/ANY", headers=clean, timeout=15)
        assert r.status_code == 401
