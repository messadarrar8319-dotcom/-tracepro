"""Iteration 3 backend tests: offline idempotency, statistics, reminders, CSV export,
strict company_id isolation across features."""
import uuid
import pytest
import requests
from datetime import datetime, timedelta


# ==================== Helpers ====================
def _register(session, base_url, prefix="TEST_iso"):
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


# ==================== OFFLINE IDEMPOTENCY ====================
class TestOfflineIdempotency:
    """Same client_id posted twice must produce ONE record."""

    def test_receptions_idempotent(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        batch = f"TESTIDR{uuid.uuid4().hex[:6]}"
        payload = {
            "client_id": cid,
            "supplier": "S", "product": "P", "batch_number": batch,
            "reception_date": "2026-01-15", "quantity": 1.0, "unit": "kg",
        }
        r1 = session.post(f"{base_url}/api/receptions", json=payload, headers=responsable_headers)
        assert r1.status_code == 200
        r2 = session.post(f"{base_url}/api/receptions", json=payload, headers=responsable_headers)
        assert r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == cid
        # confirm only 1 in DB
        lst = session.get(f"{base_url}/api/receptions", headers=responsable_headers).json()
        matches = [x for x in lst if x["id"] == cid]
        assert len(matches) == 1

    def test_temperatures_idempotent(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        payload = {"client_id": cid, "zone": "IDZ", "zone_type": "chambre_froide",
                   "temperature": 4.0, "conforming": True}
        r1 = session.post(f"{base_url}/api/temperatures", json=payload, headers=responsable_headers)
        r2 = session.post(f"{base_url}/api/temperatures", json=payload, headers=responsable_headers)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == cid

    def test_cleaning_idempotent(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        p = {"client_id": cid, "zone": "IDZ", "operation_type": "desinfection"}
        r1 = session.post(f"{base_url}/api/cleaning", json=p, headers=responsable_headers)
        r2 = session.post(f"{base_url}/api/cleaning", json=p, headers=responsable_headers)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == cid

    def test_nc_idempotent(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        p = {"client_id": cid, "problem_type": "temperature",
             "concerned_item": "IDNC", "description": "idem"}
        r1 = session.post(f"{base_url}/api/non-conformities", json=p, headers=responsable_headers)
        r2 = session.post(f"{base_url}/api/non-conformities", json=p, headers=responsable_headers)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == cid

    def test_losses_idempotent(self, session, base_url, responsable_headers):
        cid = str(uuid.uuid4())
        p = {"client_id": cid, "product": "IDL", "quantity": 1.0, "unit": "kg",
             "reason": "casse", "estimated_value": 5.0}
        r1 = session.post(f"{base_url}/api/losses", json=p, headers=responsable_headers)
        r2 = session.post(f"{base_url}/api/losses", json=p, headers=responsable_headers)
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == cid

    def test_no_client_id_still_works(self, session, base_url, responsable_headers):
        """Server generates uuid when client_id missing."""
        r = session.post(f"{base_url}/api/temperatures", headers=responsable_headers,
                         json={"zone": "AutoID", "zone_type": "chambre_froide",
                               "temperature": 5.0, "conforming": True})
        assert r.status_code == 200
        assert r.json()["id"] and len(r.json()["id"]) > 10


# ==================== STATISTICS ====================
class TestStatistics:
    def test_statistics_shape(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/statistics", headers=responsable_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for k in ("weeks", "months", "receptions_week", "receptions_month",
                  "losses_week", "losses_month", "nc_week", "nc_month",
                  "temperatures_week", "temperatures_month",
                  "temperature_conformity", "dlc_stats", "totals"):
            assert k in d, f"missing key {k}"
        assert isinstance(d["weeks"], list) and len(d["weeks"]) == 8
        assert isinstance(d["months"], list) and len(d["months"]) >= 1
        assert set(d["temperature_conformity"].keys()) == {"conforme", "non_conforme"}
        assert set(d["dlc_stats"].keys()) == {"ok", "proche", "depassee", "sans_dlc"}
        for k in ("receptions", "losses_count", "losses_value", "nc", "temperatures"):
            assert k in d["totals"]

    def test_statistics_reflects_new_data(self, session, base_url, responsable_headers):
        before = session.get(f"{base_url}/api/statistics", headers=responsable_headers).json()
        before_recs = before["totals"]["receptions"]
        # Add a reception
        session.post(f"{base_url}/api/receptions", headers=responsable_headers, json={
            "supplier": "STAT", "product": "STAT", "batch_number": f"TESTSTAT{uuid.uuid4().hex[:5]}",
            "reception_date": "2026-01-15", "quantity": 1.0, "unit": "kg",
        })
        after = session.get(f"{base_url}/api/statistics", headers=responsable_headers).json()
        assert after["totals"]["receptions"] == before_recs + 1


# ==================== REMINDERS ====================
class TestReminders:
    def test_get_config_defaults(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/reminders/config", headers=responsable_headers)
        assert r.status_code == 200
        c = r.json()
        assert c.get("temperature_enabled") is True
        assert "08:00" in (c.get("temperature_times") or [])
        assert "18:00" in (c.get("temperature_times") or [])
        assert c.get("cleaning_time") == "20:00"

    def test_put_config_responsable_ok(self, session, base_url, responsable_headers):
        payload = {
            "temperature_enabled": True,
            "temperature_times": ["07:30", "17:30"],
            "cleaning_enabled": True,
            "cleaning_time": "19:00",
            "custom_controls": [{"name": "Contrôle huiles", "time": "12:00"}],
        }
        r = session.put(f"{base_url}/api/reminders/config", json=payload, headers=responsable_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["temperature_times"] == ["07:30", "17:30"]
        assert d["cleaning_time"] == "19:00"
        assert len(d["custom_controls"]) == 1
        # restore defaults for other tests
        session.put(f"{base_url}/api/reminders/config", headers=responsable_headers, json={
            "temperature_enabled": True, "temperature_times": ["08:00", "18:00"],
            "cleaning_enabled": True, "cleaning_time": "20:00", "custom_controls": [],
        })

    def test_put_config_employee_403(self, session, base_url, new_employee):
        r = session.put(f"{base_url}/api/reminders/config", headers=new_employee["headers"],
                        json={"temperature_enabled": False, "temperature_times": [],
                              "cleaning_enabled": False, "cleaning_time": "20:00",
                              "custom_controls": []})
        assert r.status_code == 403

    def test_pending_shape(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/reminders/pending", headers=responsable_headers)
        assert r.status_code == 200
        d = r.json()
        assert "pending" in d and isinstance(d["pending"], list)

    def test_dashboard_includes_pending(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/dashboard", headers=responsable_headers)
        assert r.status_code == 200
        assert "pending_controls" in r.json()
        assert isinstance(r.json()["pending_controls"], list)


# ==================== CSV EXPORT ====================
class TestCsvExport:
    @pytest.mark.parametrize("doc_type", ["receptions", "temperatures", "cleaning",
                                          "non_conformities", "losses"])
    def test_csv_export_ok(self, session, base_url, responsable_headers, doc_type):
        r = session.get(f"{base_url}/api/export/csv/{doc_type}", headers=responsable_headers)
        assert r.status_code == 200, r.text
        ct = r.headers.get("content-type", "")
        assert "text/csv" in ct
        # UTF-8 BOM check
        assert r.content[:3] == b"\xef\xbb\xbf", f"missing BOM for {doc_type}"
        text = r.content[3:].decode("utf-8", errors="ignore")
        # header line uses ';' delimiter
        header = text.splitlines()[0] if text else ""
        assert ";" in header, f"expected ';' delimiter, got: {header!r}"

    def test_csv_invalid_type_400(self, session, base_url, responsable_headers):
        r = session.get(f"{base_url}/api/export/csv/nope", headers=responsable_headers)
        assert r.status_code == 400

    def test_csv_batch_history(self, session, base_url, responsable_headers):
        batch = f"TESTCSV{uuid.uuid4().hex[:5]}"
        session.post(f"{base_url}/api/receptions", headers=responsable_headers, json={
            "supplier": "S", "product": "P", "batch_number": batch,
            "reception_date": "2026-01-15", "quantity": 5, "unit": "kg",
        })
        r = session.get(f"{base_url}/api/export/csv-batch/{batch}", headers=responsable_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert r.content[:3] == b"\xef\xbb\xbf"

    def test_csv_supplier_filter(self, session, base_url, responsable_headers):
        # Add a reception with unique supplier
        unique_supp = f"SUPP_{uuid.uuid4().hex[:6]}"
        batch = f"TESTFLT{uuid.uuid4().hex[:5]}"
        session.post(f"{base_url}/api/receptions", headers=responsable_headers, json={
            "supplier": unique_supp, "product": "P", "batch_number": batch,
            "reception_date": "2026-01-15", "quantity": 3, "unit": "kg",
        })
        r = session.get(f"{base_url}/api/export/csv/receptions",
                        headers=responsable_headers, params={"supplier": unique_supp})
        assert r.status_code == 200
        text = r.content.decode("utf-8", errors="ignore")
        assert unique_supp in text
        # Non-matching filter -> only header
        r2 = session.get(f"{base_url}/api/export/csv/receptions",
                         headers=responsable_headers, params={"supplier": "NOSUCHXYZ"})
        assert r2.status_code == 200
        lines = [l for l in r2.content.decode("utf-8", errors="ignore").splitlines() if l.strip()]
        assert len(lines) == 1  # header only


# ==================== COMPANY ISOLATION ====================
class TestCompanyIsolation:
    def test_two_orgs_isolated(self, session, base_url):
        org_a = _register(session, base_url, prefix="TEST_isoA")
        org_b = _register(session, base_url, prefix="TEST_isoB")

        # Org A creates data
        batch_a = f"TESTISOA{uuid.uuid4().hex[:5]}"
        session.post(f"{base_url}/api/receptions", headers=org_a["headers"], json={
            "supplier": "A_SUP", "product": "A_PROD", "batch_number": batch_a,
            "reception_date": "2026-01-15", "quantity": 7, "unit": "kg",
        })
        session.post(f"{base_url}/api/losses", headers=org_a["headers"],
                     json={"product": "A_LOSS", "quantity": 1, "unit": "kg",
                           "reason": "casse", "estimated_value": 10})

        # Org B creates its own
        batch_b = f"TESTISOB{uuid.uuid4().hex[:5]}"
        session.post(f"{base_url}/api/receptions", headers=org_b["headers"], json={
            "supplier": "B_SUP", "product": "B_PROD", "batch_number": batch_b,
            "reception_date": "2026-01-15", "quantity": 4, "unit": "kg",
        })

        # Org B receptions list must NOT contain org A's batches
        b_recs = session.get(f"{base_url}/api/receptions", headers=org_b["headers"]).json()
        assert all(r["batch_number"] != batch_a for r in b_recs)
        assert any(r["batch_number"] == batch_b for r in b_recs)

        # Org B CSV export must NOT contain org A data
        csv_b = session.get(f"{base_url}/api/export/csv/receptions", headers=org_b["headers"])
        assert csv_b.status_code == 200
        text_b = csv_b.content.decode("utf-8", errors="ignore")
        assert "A_SUP" not in text_b and batch_a not in text_b
        assert "B_SUP" in text_b

        # Org B cannot see Org A batch traceability -> 404
        b_get_a = session.get(f"{base_url}/api/batches/{batch_a}", headers=org_b["headers"])
        assert b_get_a.status_code == 404

        # Statistics: org B totals should not include org A losses value
        stats_b = session.get(f"{base_url}/api/statistics", headers=org_b["headers"]).json()
        # Org B has 0 losses so far
        assert stats_b["totals"]["losses_count"] == 0

        # Reminders config isolation: org B should have defaults, unaffected by A
        cfg_b = session.get(f"{base_url}/api/reminders/config", headers=org_b["headers"]).json()
        assert cfg_b["temperature_enabled"] is True

        # Client_id collision across orgs is allowed (namespaced by org_id)
        shared_cid = str(uuid.uuid4())
        rA = session.post(f"{base_url}/api/temperatures", headers=org_a["headers"], json={
            "client_id": shared_cid, "zone": "ZA", "zone_type": "chambre_froide",
            "temperature": 3.0, "conforming": True})
        rB = session.post(f"{base_url}/api/temperatures", headers=org_b["headers"], json={
            "client_id": shared_cid, "zone": "ZB", "zone_type": "chambre_froide",
            "temperature": 4.0, "conforming": True})
        assert rA.status_code == 200 and rB.status_code == 200
        # Both should have created a document (isolated by org). Verify org B temperatures list contains ZB
        tB = session.get(f"{base_url}/api/temperatures", headers=org_b["headers"]).json()
        assert any(t.get("zone") == "ZB" for t in tB)
        assert all(t.get("zone") != "ZA" for t in tB)
