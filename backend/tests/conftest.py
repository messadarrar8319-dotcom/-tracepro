"""Shared pytest fixtures for TRACEPRO backend."""
import os
import uuid
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parents[2] / "frontend" / ".env")
BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/")

RESPONSABLE = {"email": "test@tracepro.fr", "password": "password123"}


@pytest.fixture(scope="session")
def base_url():
    assert BASE_URL, "EXPO_PUBLIC_BACKEND_URL missing"
    return BASE_URL


@pytest.fixture(scope="session")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def responsable_token(session, base_url):
    r = session.post(f"{base_url}/api/auth/login", json=RESPONSABLE, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def responsable_headers(responsable_token):
    return {"Authorization": f"Bearer {responsable_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def new_employee(session, base_url, responsable_headers):
    """Create a fresh employee via invite endpoint; used for role tests."""
    email = f"TEST_emp_{uuid.uuid4().hex[:6]}@tracepro.fr"
    payload = {"name": "TEST Employee", "email": email, "password": "employee123", "role": "employe"}
    r = session.post(f"{base_url}/api/users/invite", json=payload, headers=responsable_headers, timeout=15)
    assert r.status_code == 200, f"Invite failed: {r.status_code} {r.text}"
    # Login as this employee
    login = session.post(f"{base_url}/api/auth/login", json={"email": email, "password": "employee123"}, timeout=15)
    assert login.status_code == 200
    return {
        "email": email,
        "id": r.json()["id"],
        "token": login.json()["access_token"],
        "headers": {"Authorization": f"Bearer {login.json()['access_token']}", "Content-Type": "application/json"},
    }
