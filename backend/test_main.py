"""
Chartli API test suite.

Env vars are set before any backend import so Settings() picks them up
on first instantiation. pytest always runs in a fresh process.
"""
import os

os.environ["GROQ_API_KEY"] = "gsk_test_dummy"
os.environ["CHARTLI_PIN"] = "testpin123"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import json
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.database import Base, get_db
from backend.main import app
from backend.models import Note

# ── Test database ──────────────────────────────────────────────────────────────
# StaticPool ensures all sessions share a single in-memory SQLite connection,
# which is required for the database to persist across requests within a test.

_TEST_ENGINE = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSession = sessionmaker(autocommit=False, autoflush=False, bind=_TEST_ENGINE)


def _override_get_db():
    db = _TestSession()
    try:
        yield db
    finally:
        db.close()


# ── Fixtures ───────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def reset_db():
    """Drop and recreate all tables before each test for full isolation."""
    Base.metadata.drop_all(bind=_TEST_ENGINE)
    Base.metadata.create_all(bind=_TEST_ENGINE)


@pytest.fixture
def client():
    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


PIN = "testpin123"
H = {"X-Chartli-PIN": PIN}  # authenticated headers shorthand


# ── Helpers ────────────────────────────────────────────────────────────────────

_VALID_SOAP = {
    "subjective": "Patient reports persistent headache for 2 days, worse in mornings.",
    "objective": "BP 130/85 mmHg, HR 78 bpm, Temp 37.0°C, SpO2 98%.",
    "assessment": "Tension-type headache.",
    "plan": "Ibuprofen 400mg TDS for 3 days. Rest. Return if no improvement in 5 days.",
}


def _mock_groq_client(content: str | None = None) -> MagicMock:
    """Return a Groq client mock whose chat.completions.create() returns `content`."""
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = content or json.dumps(_VALID_SOAP)
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    return mock_client


def _make_patient(client: TestClient, **overrides) -> dict:
    payload = {
        "full_name": "Ahmed Khan",
        "age": 35,
        "gender": "male",
        **overrides,
    }
    r = client.post("/patients", json=payload, headers=H)
    assert r.status_code == 201, r.text
    return r.json()


# ══════════════════════════════════════════════════════════════════════════════
# Auth
# ══════════════════════════════════════════════════════════════════════════════

def test_no_pin_returns_422(client):
    r = client.get("/patients/search")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"


def test_wrong_pin_returns_401(client):
    r = client.get("/patients/search", headers={"X-Chartli-PIN": "wrongpin"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "invalid_pin"


def test_health_requires_no_pin(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


# ══════════════════════════════════════════════════════════════════════════════
# Create patient
# ══════════════════════════════════════════════════════════════════════════════

def test_create_patient_minimal(client):
    r = client.post("/patients", json={"full_name": "Sara Ali", "age": 28, "gender": "female"}, headers=H)
    assert r.status_code == 201
    data = r.json()
    assert data["full_name"] == "Sara Ali"
    assert data["age"] == 28
    assert data["gender"] == "female"
    assert data["display_id"].startswith("P-")
    assert "id" in data


def test_create_patient_all_fields(client):
    payload = {
        "full_name": "  Dr. Bilal  ",  # leading/trailing whitespace stripped
        "age": 45,
        "gender": "male",
        "blood_group": "O+",
        "allergies": "Penicillin",
        "chronic_conditions": "Hypertension, Diabetes Type 2",
        "contact": "+92 300 1234567",
    }
    r = client.post("/patients", json=payload, headers=H)
    assert r.status_code == 201
    data = r.json()
    assert data["full_name"] == "Dr. Bilal"  # stripped
    assert data["blood_group"] == "O+"
    assert data["allergies"] == "Penicillin"


def test_create_patient_display_id_format(client):
    p1 = _make_patient(client, full_name="First Patient")
    p2 = _make_patient(client, full_name="Second Patient")

    import re
    from datetime import datetime, timezone
    year = datetime.now(timezone.utc).year
    pattern = re.compile(rf"^P-{year}-\d{{5}}$")

    assert pattern.match(p1["display_id"]), f"Bad display_id: {p1['display_id']}"
    assert pattern.match(p2["display_id"]), f"Bad display_id: {p2['display_id']}"
    assert p1["display_id"] != p2["display_id"]


def test_create_patient_display_id_monotonic(client):
    p1 = _make_patient(client, full_name="A")
    p2 = _make_patient(client, full_name="B")
    p3 = _make_patient(client, full_name="C")
    seq = [int(p["display_id"].split("-")[2]) for p in [p1, p2, p3]]
    assert seq == sorted(seq) and seq[0] < seq[1] < seq[2]


def test_create_patient_invalid_age_too_high(client):
    r = client.post("/patients", json={"full_name": "X", "age": 131, "gender": "male"}, headers=H)
    assert r.status_code == 422


def test_create_patient_invalid_age_negative(client):
    r = client.post("/patients", json={"full_name": "X", "age": -1, "gender": "male"}, headers=H)
    assert r.status_code == 422


def test_create_patient_missing_required_fields(client):
    r = client.post("/patients", json={"age": 30}, headers=H)
    assert r.status_code == 422


def test_create_patient_invalid_gender(client):
    r = client.post("/patients", json={"full_name": "X", "age": 30, "gender": "alien"}, headers=H)
    assert r.status_code == 422


def test_create_patient_invalid_contact(client):
    r = client.post(
        "/patients",
        json={"full_name": "X", "age": 30, "gender": "male", "contact": "not-a-number"},
        headers=H,
    )
    assert r.status_code == 422


def test_create_patient_valid_contact_formats(client):
    for contact in ["+92 300 1234567", "03001234567", "+1-800-555-1234"]:
        r = client.post(
            "/patients",
            json={"full_name": "X", "age": 30, "gender": "male", "contact": contact},
            headers=H,
        )
        assert r.status_code == 201, f"Failed for contact: {contact}"


def test_create_patient_whitespace_name_rejected(client):
    r = client.post("/patients", json={"full_name": "   ", "age": 30, "gender": "male"}, headers=H)
    assert r.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# Get patient
# ══════════════════════════════════════════════════════════════════════════════

def test_get_patient_by_uuid(client):
    created = _make_patient(client)
    r = client.get(f"/patients/{created['id']}", headers=H)
    assert r.status_code == 200
    assert r.json()["id"] == created["id"]


def test_get_patient_by_display_id(client):
    created = _make_patient(client)
    r = client.get(f"/patients/{created['display_id']}", headers=H)
    assert r.status_code == 200
    assert r.json()["display_id"] == created["display_id"]


def test_get_patient_not_found(client):
    r = client.get("/patients/00000000-0000-0000-0000-000000000000", headers=H)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_get_deleted_patient_not_found(client):
    p = _make_patient(client)
    client.delete(f"/patients/{p['id']}", headers=H)
    r = client.get(f"/patients/{p['id']}", headers=H)
    assert r.status_code == 404


# ══════════════════════════════════════════════════════════════════════════════
# Search patients
# ══════════════════════════════════════════════════════════════════════════════

def test_search_by_name_partial(client):
    _make_patient(client, full_name="Muhammad Zubair")
    _make_patient(client, full_name="Zubair Ahmed")
    _make_patient(client, full_name="Fatima Malik")

    r = client.get("/patients/search?q=zubair", headers=H)
    assert r.status_code == 200
    names = [p["full_name"] for p in r.json()["items"]]
    assert "Muhammad Zubair" in names
    assert "Zubair Ahmed" in names
    assert "Fatima Malik" not in names


def test_search_case_insensitive(client):
    _make_patient(client, full_name="Muhammad Ali")

    for query in ["muhammad ali", "MUHAMMAD ALI", "Muhammad Ali", "mUhAmMaD"]:
        r = client.get(f"/patients/search?q={query}", headers=H)
        assert r.status_code == 200
        assert r.json()["total"] >= 1, f"Expected match for query: {query}"


def test_search_by_display_id_exact(client):
    p = _make_patient(client)
    did = p["display_id"]

    r = client.get(f"/patients/search?q={did}", headers=H)
    assert r.status_code == 200
    assert any(item["display_id"] == did for item in r.json()["items"])


def test_search_empty_q_returns_most_recent(client):
    _make_patient(client, full_name="Old Patient")
    _make_patient(client, full_name="New Patient")

    r = client.get("/patients/search", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    # Most recently updated should appear first
    assert data["items"][0]["full_name"] == "New Patient"


def test_search_excludes_soft_deleted(client):
    p = _make_patient(client)
    client.delete(f"/patients/{p['id']}", headers=H)

    r = client.get(f"/patients/search?q={p['full_name']}", headers=H)
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_search_include_deleted(client):
    p = _make_patient(client)
    client.delete(f"/patients/{p['id']}", headers=H)

    r = client.get(f"/patients/search?q={p['full_name']}&include_deleted=true", headers=H)
    assert r.status_code == 200
    assert r.json()["total"] == 1


def test_duplicate_names_both_appear(client):
    _make_patient(client, full_name="Ali Hassan", age=30)
    _make_patient(client, full_name="Ali Hassan", age=45)

    r = client.get("/patients/search?q=Ali Hassan", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["total"] == 2
    ages = {p["age"] for p in data["items"]}
    assert ages == {30, 45}
    # Both have different display_ids
    display_ids = {p["display_id"] for p in data["items"]}
    assert len(display_ids) == 2


def test_search_pagination(client):
    for i in range(5):
        _make_patient(client, full_name=f"Patient {i}")

    r = client.get("/patients/search?limit=2&offset=0", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5
    assert data["limit"] == 2
    assert data["offset"] == 0


# ══════════════════════════════════════════════════════════════════════════════
# Update patient
# ══════════════════════════════════════════════════════════════════════════════

def test_update_patient_partial(client):
    p = _make_patient(client, full_name="Original Name", age=30)

    r = client.patch(f"/patients/{p['id']}", json={"age": 31}, headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["age"] == 31
    assert data["full_name"] == "Original Name"  # untouched


def test_update_patient_all_fields(client):
    p = _make_patient(client)
    r = client.patch(
        f"/patients/{p['id']}",
        json={
            "full_name": "Updated Name",
            "age": 55,
            "gender": "female",
            "blood_group": "AB-",
            "allergies": "Sulfa drugs",
            "chronic_conditions": "COPD",
            "contact": "+92-21-1234567",
        },
        headers=H,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["full_name"] == "Updated Name"
    assert data["blood_group"] == "AB-"


def test_update_patient_not_found(client):
    r = client.patch(
        "/patients/00000000-0000-0000-0000-000000000000",
        json={"age": 40},
        headers=H,
    )
    assert r.status_code == 404


def test_update_patient_invalid_age(client):
    p = _make_patient(client)
    r = client.patch(f"/patients/{p['id']}", json={"age": 200}, headers=H)
    assert r.status_code == 422


# ══════════════════════════════════════════════════════════════════════════════
# Delete patient
# ══════════════════════════════════════════════════════════════════════════════

def test_delete_patient_soft(client):
    p = _make_patient(client)
    r = client.delete(f"/patients/{p['id']}", headers=H)
    assert r.status_code == 204

    # Not findable by default
    r = client.get(f"/patients/{p['id']}", headers=H)
    assert r.status_code == 404


def test_delete_patient_not_found(client):
    r = client.delete("/patients/00000000-0000-0000-0000-000000000000", headers=H)
    assert r.status_code == 404


def test_delete_then_search_excludes(client):
    p = _make_patient(client, full_name="Deleted One")
    client.delete(f"/patients/{p['id']}", headers=H)

    r = client.get("/patients/search?q=Deleted One", headers=H)
    assert r.json()["total"] == 0


def test_deleted_patient_visible_with_include_deleted(client):
    p = _make_patient(client, full_name="Ghost Patient")
    client.delete(f"/patients/{p['id']}", headers=H)

    r = client.get("/patients/search?q=Ghost Patient&include_deleted=true", headers=H)
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["deleted_at"] is not None


# ══════════════════════════════════════════════════════════════════════════════
# SOAP generation
# ══════════════════════════════════════════════════════════════════════════════

@pytest.fixture
def db_session():
    """Direct DB access for test setup (e.g. inserting finalized notes)."""
    db = _TestSession()
    try:
        yield db
    finally:
        db.close()


def _generate_note(client: TestClient, patient_id: str, raw_input: str = "Patient has headache.", mode: str = "typed") -> dict:
    r = client.post("/notes/generate", json={
        "patient_id": patient_id,
        "raw_input": raw_input,
        "input_mode": mode,
    }, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def test_generate_soap_creates_draft_note(client):
    patient = _make_patient(client)
    with patch("backend.services._get_groq", return_value=_mock_groq_client()):
        data = _generate_note(client, patient["id"])

    assert "note_id" in data
    assert data["status"] == "draft"
    assert data["soap"]["subjective"]
    assert data["soap"]["assessment"] == _VALID_SOAP["assessment"]
    assert data["ai_model"] == "llama-3.3-70b-versatile"
    assert data["generation_ms"] >= 0


def test_generate_soap_all_input_modes(client):
    patient = _make_patient(client)
    for mode in ("typed", "dictation", "conversation"):
        with patch("backend.services._get_groq", return_value=_mock_groq_client()):
            data = _generate_note(client, patient["id"], mode=mode)
        assert data["status"] == "draft"


def test_generate_soap_with_vitals_in_prompt(client):
    """Vitals text must appear in the system prompt sent to the LLM."""
    patient = _make_patient(client)
    mock_client = _mock_groq_client()

    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "Patient came for checkup.",
            "input_mode": "typed",
            "vitals": {"bp": "145/95", "hr": 88, "temp_c": 37.0, "spo2": 98, "weight_kg": 76},
        }, headers=H)
    assert r.status_code == 200

    call_kwargs = mock_client.chat.completions.create.call_args[1]
    system_msg = call_kwargs["messages"][0]["content"]
    assert "145/95" in system_msg
    assert "88" in system_msg      # HR
    assert "37.0" in system_msg    # Temp


def test_generate_soap_allergy_in_patient_context(client):
    """Patient allergies must be injected into the SOAP system prompt."""
    patient = _make_patient(client, allergies="Penicillin, Sulfa")
    mock_client = _mock_groq_client()

    with patch("backend.services._get_groq", return_value=mock_client):
        _generate_note(client, patient["id"], raw_input="Prescribing amoxicillin for the infection.")

    system_msg = mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
    assert "Penicillin" in system_msg
    assert "Sulfa" in system_msg


def test_generate_soap_json_parse_fail_retries(client):
    """First LLM response is invalid JSON → should retry → succeed on second call."""
    valid_json = json.dumps({
        "subjective": "Retry succeeded.",
        "objective": "Normal exam.",
        "assessment": "Healthy.",
        "plan": "No action needed.",
    })

    call_count = 0
    def _side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = "not valid json {{{{" if call_count == 1 else valid_json
        return resp

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = _side_effect

    patient = _make_patient(client)
    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "Patient has a fever.",
            "input_mode": "typed",
        }, headers=H)

    assert r.status_code == 200
    assert r.json()["soap"]["assessment"] == "Healthy."
    assert mock_client.chat.completions.create.call_count == 2


def test_generate_soap_both_retries_fail_graceful_fallback(client):
    """Both LLM calls return invalid JSON → graceful fallback with raw input in subjective."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content="definitely not json {{{{ }}"))]
    )

    patient = _make_patient(client)
    raw_text = "Patient has cough and cold."
    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": raw_text,
            "input_mode": "typed",
        }, headers=H)

    assert r.status_code == 200
    data = r.json()
    assert "AI generation failed" in data["soap"]["subjective"]
    assert raw_text in data["soap"]["subjective"]
    assert data["soap"]["objective"] == "[Not documented]"
    assert data["soap"]["assessment"] == "[Not documented]"
    assert data["soap"]["plan"] == "[Not documented]"
    assert mock_client.chat.completions.create.call_count == 2


def test_generate_soap_missing_soap_keys_fallback(client):
    """LLM returns valid JSON but missing required keys → fallback."""
    bad_soap = json.dumps({"s": "missing keys"})
    mock_client = _mock_groq_client(content=bad_soap)

    patient = _make_patient(client)
    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "Something.",
            "input_mode": "typed",
        }, headers=H)

    assert r.status_code == 200
    assert "AI generation failed" in r.json()["soap"]["subjective"]


def test_generate_soap_patient_not_found(client):
    with patch("backend.services._get_groq", return_value=_mock_groq_client()):
        r = client.post("/notes/generate", json={
            "patient_id": "00000000-0000-0000-0000-000000000000",
            "raw_input": "Some input.",
            "input_mode": "typed",
        }, headers=H)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_generate_soap_input_too_long(client):
    patient = _make_patient(client)
    r = client.post("/notes/generate", json={
        "patient_id": patient["id"],
        "raw_input": "x" * 10_001,
        "input_mode": "typed",
    }, headers=H)
    assert r.status_code == 422


def test_generate_soap_stricter_prompt_on_retry(client):
    """Verify the retry system prompt contains the stricter suffix."""
    call_count = 0
    captured_prompts: list[str] = []

    def _side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        captured_prompts.append(kwargs["messages"][0]["content"])
        resp = MagicMock()
        resp.choices = [MagicMock()]
        resp.choices[0].message.content = (
            "not json" if call_count == 1 else json.dumps(_VALID_SOAP)
        )
        return resp

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = _side_effect

    patient = _make_patient(client)
    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "Visit notes.",
            "input_mode": "typed",
        }, headers=H)

    assert r.status_code == 200
    assert len(captured_prompts) == 2
    assert "CRITICAL" in captured_prompts[1]   # stricter suffix present
    assert "CRITICAL" not in captured_prompts[0]  # not in first attempt


def test_generate_soap_history_injected(client, db_session):
    """Prior finalized notes must appear in the LLM system prompt."""
    patient = _make_patient(client)
    patient_id = uuid.UUID(patient["id"])

    # Insert a finalized note directly — finalize endpoint comes in Part 5
    prior = Note(
        patient_id=patient_id,
        status="finalized",
        input_mode="typed",
        raw_input="Prior visit raw input.",
        soap_assessment="Hypertension, Stage 1.",
        soap_plan="Amlodipine 5mg once daily.",
        ai_assessment="Hypertension, Stage 1.",
        ai_plan="Amlodipine 5mg once daily.",
        finalized_at=datetime.now(timezone.utc),
    )
    db_session.add(prior)
    db_session.commit()

    mock_client = _mock_groq_client()
    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "Follow-up visit.",
            "input_mode": "typed",
        }, headers=H)

    assert r.status_code == 200
    system_msg = mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
    assert "Hypertension" in system_msg
    assert "Amlodipine" in system_msg


def test_generate_soap_draft_notes_not_in_history(client, db_session):
    """Draft notes must NOT be injected as history context."""
    patient = _make_patient(client)
    patient_id = uuid.UUID(patient["id"])

    draft = Note(
        patient_id=patient_id,
        status="draft",
        input_mode="typed",
        raw_input="Draft note raw input.",
        soap_assessment="Draft assessment SHOULD_NOT_APPEAR.",
        soap_plan="Draft plan.",
        ai_assessment="Draft assessment SHOULD_NOT_APPEAR.",
        ai_plan="Draft plan.",
    )
    db_session.add(draft)
    db_session.commit()

    mock_client = _mock_groq_client()
    with patch("backend.services._get_groq", return_value=mock_client):
        r = client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "New visit.",
            "input_mode": "typed",
        }, headers=H)

    assert r.status_code == 200
    system_msg = mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
    assert "SHOULD_NOT_APPEAR" not in system_msg


# ══════════════════════════════════════════════════════════════════════════════
# Note listing
# ══════════════════════════════════════════════════════════════════════════════

def test_list_patient_notes_empty(client):
    patient = _make_patient(client)
    r = client.get(f"/patients/{patient['id']}/notes", headers=H)
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_list_patient_notes_after_generate(client):
    patient = _make_patient(client)
    with patch("backend.services._get_groq", return_value=_mock_groq_client()):
        _generate_note(client, patient["id"])

    r = client.get(f"/patients/{patient['id']}/notes", headers=H)
    data = r.json()
    assert data["total"] == 1
    assert data["items"][0]["status"] == "draft"
    assert data["items"][0]["input_mode"] == "typed"


def test_list_patient_notes_status_filter(client):
    patient = _make_patient(client)
    with patch("backend.services._get_groq", return_value=_mock_groq_client()):
        _generate_note(client, patient["id"])

    r_draft = client.get(f"/patients/{patient['id']}/notes?status=draft", headers=H)
    assert r_draft.json()["total"] == 1

    r_final = client.get(f"/patients/{patient['id']}/notes?status=finalized", headers=H)
    assert r_final.json()["total"] == 0


def test_list_patient_notes_patient_not_found(client):
    r = client.get("/patients/00000000-0000-0000-0000-000000000000/notes", headers=H)
    assert r.status_code == 404


def test_list_patient_notes_excludes_other_patients(client):
    p1 = _make_patient(client, full_name="Patient One")
    p2 = _make_patient(client, full_name="Patient Two")

    with patch("backend.services._get_groq", return_value=_mock_groq_client()):
        _generate_note(client, p1["id"])
        _generate_note(client, p1["id"])
        _generate_note(client, p2["id"])

    r = client.get(f"/patients/{p1['id']}/notes", headers=H)
    assert r.json()["total"] == 2

    r = client.get(f"/patients/{p2['id']}/notes", headers=H)
    assert r.json()["total"] == 1


# ══════════════════════════════════════════════════════════════════════════════
# Transcription
# ══════════════════════════════════════════════════════════════════════════════

_FAKE_MP3 = b"\xff\xfb\x90\x00" + b"\x00" * 100   # minimal fake MP3 header bytes
_FAKE_DURATION = 45.3


def _mock_whisper_client(transcript: str = "Patient reports headache.", language: str = "en") -> MagicMock:
    """Build a Groq client mock whose audio.transcriptions.create() returns a Whisper response."""
    mock_resp = MagicMock()
    mock_resp.text = transcript
    mock_resp.language = language
    mock_resp.duration = _FAKE_DURATION
    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.return_value = mock_resp
    return mock_client


def _post_audio(client: TestClient, audio_bytes=None, filename="test.mp3", mode="dictation") -> object:
    return client.post(
        "/transcribe",
        files={"audio": (filename, audio_bytes or _FAKE_MP3, "audio/mpeg")},
        data={"mode": mode},
        headers=H,
    )


@pytest.fixture
def mock_ffprobe():
    """Patch ffmpeg.probe to return a fake duration without touching disk."""
    with patch("backend.services.ffmpeg.probe", return_value={"format": {"duration": str(_FAKE_DURATION)}}):
        yield


def test_transcribe_valid_dictation(client, mock_ffprobe):
    with patch("backend.services._get_groq", return_value=_mock_whisper_client()):
        r = _post_audio(client, mode="dictation")

    assert r.status_code == 200
    data = r.json()
    assert data["transcript"] == "Patient reports headache."
    assert data["detected_language"] == "en"
    assert data["duration_seconds"] == _FAKE_DURATION
    assert data["transcription_ms"] >= 0


def test_transcribe_valid_conversation(client, mock_ffprobe):
    with patch("backend.services._get_groq", return_value=_mock_whisper_client(transcript="Doctor: How are you? Patient: I have a fever.")):
        r = _post_audio(client, mode="conversation")

    assert r.status_code == 200
    assert "fever" in r.json()["transcript"]


def test_transcribe_all_accepted_formats(client, mock_ffprobe):
    formats = [("audio.mp3", "audio/mpeg"), ("audio.wav", "audio/wav"),
               ("audio.m4a", "audio/mp4"), ("audio.ogg", "audio/ogg"),
               ("audio.webm", "audio/webm"), ("audio.flac", "audio/flac")]
    for filename, content_type in formats:
        with patch("backend.services._get_groq", return_value=_mock_whisper_client()):
            r = client.post(
                "/transcribe",
                files={"audio": (filename, _FAKE_MP3, content_type)},
                data={"mode": "dictation"},
                headers=H,
            )
        assert r.status_code == 200, f"Failed for {filename}: {r.text}"


def test_transcribe_unsupported_format(client):
    r = _post_audio(client, filename="document.pdf")
    assert r.status_code == 415
    assert r.json()["error"]["code"] == "unsupported_format"


def test_transcribe_unsupported_format_txt(client):
    r = _post_audio(client, filename="notes.txt")
    assert r.status_code == 415


def test_transcribe_audio_too_large(client):
    # 26 MB — exceeds the 25 MB limit; no ffprobe or Whisper call needed
    big_audio = b"x" * (26 * 1024 * 1024)
    r = _post_audio(client, audio_bytes=big_audio)
    assert r.status_code == 413
    assert r.json()["error"]["code"] == "audio_too_large"


def test_transcribe_audio_too_long(client):
    # ffprobe returns > 600 seconds
    with patch("backend.services.ffmpeg.probe", return_value={"format": {"duration": "601"}}):
        r = _post_audio(client)
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "audio_too_long"


def test_transcribe_invalid_mode(client, mock_ffprobe):
    r = client.post(
        "/transcribe",
        files={"audio": ("test.mp3", _FAKE_MP3, "audio/mpeg")},
        data={"mode": "typed"},   # "typed" is not valid for /transcribe
        headers=H,
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_mode"


def test_transcribe_empty_transcript_returns_200(client, mock_ffprobe):
    """Empty/silent audio → 200 with empty string; UI shows the banner."""
    with patch("backend.services._get_groq", return_value=_mock_whisper_client(transcript="")):
        r = _post_audio(client)
    assert r.status_code == 200
    assert r.json()["transcript"] == ""


def test_transcribe_non_english_detected_still_200(client, mock_ffprobe):
    """Non-English audio → 200 with transcript + non-en detected_language; UI shows banner."""
    with patch("backend.services._get_groq", return_value=_mock_whisper_client(transcript="مریض کو سردرد ہے", language="ur")):
        r = _post_audio(client)
    assert r.status_code == 200
    data = r.json()
    assert data["detected_language"] == "ur"
    assert data["transcript"] == "مریض کو سردرد ہے"


def test_transcribe_whisper_called_with_correct_params(client, mock_ffprobe):
    """Verify Whisper is called with the right model and language settings."""
    mock_client = _mock_whisper_client()
    with patch("backend.services._get_groq", return_value=mock_client):
        _post_audio(client, mode="dictation")

    call_kwargs = mock_client.audio.transcriptions.create.call_args[1]
    assert call_kwargs["model"] == "whisper-large-v3-turbo"
    assert call_kwargs["language"] == "en"
    assert call_kwargs["response_format"] == "verbose_json"


def test_transcribe_rate_limit_retries_then_succeeds(client, mock_ffprobe):
    """First Whisper call hits 429, second succeeds."""
    from groq import RateLimitError as GRateLimitError

    call_count = 0
    success_resp = MagicMock(text="Retry worked.", language="en", duration=45.0)

    def _side_effect(**kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise GRateLimitError(
                message="rate limited",
                response=MagicMock(status_code=429, headers={}),
                body={},
            )
        return success_resp

    mock_client = MagicMock()
    mock_client.audio.transcriptions.create.side_effect = _side_effect

    with patch("backend.services._get_groq", return_value=mock_client):
        with patch("backend.services.time.sleep"):   # don't actually sleep in tests
            r = _post_audio(client)

    assert r.status_code == 200
    assert r.json()["transcript"] == "Retry worked."
    assert call_count == 2


def test_transcribe_ffprobe_unavailable_allows_through(client):
    """If ffprobe fails (not installed), duration = 0 and the call is allowed through."""
    with patch("backend.services.ffmpeg.probe", side_effect=Exception("ffprobe not found")):
        with patch("backend.services._get_groq", return_value=_mock_whisper_client()):
            r = _post_audio(client)
    assert r.status_code == 200
    assert r.json()["duration_seconds"] == 0.0


def test_transcribe_no_pin_rejected(client, mock_ffprobe):
    r = client.post(
        "/transcribe",
        files={"audio": ("test.mp3", _FAKE_MP3, "audio/mpeg")},
        data={"mode": "dictation"},
    )
    assert r.status_code == 422   # missing X-Chartli-PIN header


# ══════════════════════════════════════════════════════════════════════════════
# Note lifecycle — GET, PATCH, finalize, patient-summary, DELETE
# ══════════════════════════════════════════════════════════════════════════════

_SUMMARY_TEXT = (
    "Today you came in for a headache that has lasted two days. "
    "Your blood pressure was slightly elevated. "
    "We recommend taking ibuprofen three times a day for three days and getting plenty of rest. "
    "Please return if your symptoms do not improve within five days."
)


def _make_note(client: TestClient, patient_id: str, **overrides) -> dict:
    """Generate a draft SOAP note with mocked LLM."""
    with patch("backend.services._get_groq", return_value=_mock_groq_client()):
        r = client.post("/notes/generate", json={
            "patient_id": patient_id,
            "raw_input": overrides.get("raw_input", "Patient has a headache."),
            "input_mode": overrides.get("input_mode", "typed"),
        }, headers=H)
    assert r.status_code == 200, r.text
    return r.json()


def _mock_summary_client() -> MagicMock:
    """Groq mock for patient summary calls (plain text, not JSON)."""
    mock_resp = MagicMock()
    mock_resp.choices = [MagicMock()]
    mock_resp.choices[0].message.content = _SUMMARY_TEXT
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_resp
    return mock_client


# ── GET /notes/{id} ────────────────────────────────────────────────────────────

def test_get_note_by_id(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    r = client.get(f"/notes/{note_id}", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == note_id
    assert data["status"] == "draft"
    assert data["input_mode"] == "typed"
    assert data["soap_assessment"] == _VALID_SOAP["assessment"]


def test_get_note_not_found(client):
    r = client.get("/notes/00000000-0000-0000-0000-000000000000", headers=H)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_get_soft_deleted_note_not_found(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    client.delete(f"/notes/{note['note_id']}", headers=H)

    r = client.get(f"/notes/{note['note_id']}", headers=H)
    assert r.status_code == 404


# ── PATCH /notes/{id} ─────────────────────────────────────────────────────────

def test_edit_draft_note_soap_fields(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    r = client.patch(f"/notes/{note_id}", json={
        "soap_assessment": "Doctor-edited: Tension headache, confirmed.",
        "soap_plan": "Doctor-edited: Paracetamol 1g TDS for 3 days.",
    }, headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["soap_assessment"] == "Doctor-edited: Tension headache, confirmed."
    assert data["soap_plan"] == "Doctor-edited: Paracetamol 1g TDS for 3 days."


def test_edit_draft_partial_update(client):
    """Only the provided fields change; the rest remain as-is."""
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]
    original_subjective = _VALID_SOAP["subjective"]

    client.patch(f"/notes/{note_id}", json={"soap_assessment": "Edited."}, headers=H)

    r = client.get(f"/notes/{note_id}", headers=H)
    assert r.json()["soap_subjective"] == original_subjective  # untouched


def test_edit_finalized_note_returns_409(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    client.post(f"/notes/{note_id}/finalize", headers=H)

    r = client.patch(f"/notes/{note_id}", json={"soap_assessment": "Too late."}, headers=H)
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "note_finalized"


def test_ai_original_preserved_after_edit(client):
    """ai_* columns must remain unchanged when the doctor edits soap_* columns."""
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    original_ai_assessment = _VALID_SOAP["assessment"]

    client.patch(f"/notes/{note_id}", json={
        "soap_assessment": "Completely different doctor assessment.",
    }, headers=H)

    r = client.get(f"/notes/{note_id}", headers=H)
    data = r.json()
    assert data["soap_assessment"] == "Completely different doctor assessment."
    assert data["ai_assessment"] == original_ai_assessment  # AI column frozen


def test_edit_note_not_found(client):
    r = client.patch(
        "/notes/00000000-0000-0000-0000-000000000000",
        json={"soap_assessment": "X"},
        headers=H,
    )
    assert r.status_code == 404


# ── POST /notes/{id}/finalize ─────────────────────────────────────────────────

def test_finalize_note(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    r = client.post(f"/notes/{note_id}/finalize", headers=H)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "finalized"
    assert data["finalized_at"] is not None


def test_finalize_idempotent(client):
    """Calling finalize twice must not raise an error."""
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    r1 = client.post(f"/notes/{note_id}/finalize", headers=H)
    r2 = client.post(f"/notes/{note_id}/finalize", headers=H)

    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r2.json()["status"] == "finalized"
    # finalized_at should not change on the second call
    assert r1.json()["finalized_at"] == r2.json()["finalized_at"]


def test_finalized_note_appears_in_list_as_finalized(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    client.post(f"/notes/{note['note_id']}/finalize", headers=H)

    r = client.get(f"/patients/{patient['id']}/notes?status=finalized", headers=H)
    assert r.json()["total"] == 1
    assert r.json()["items"][0]["status"] == "finalized"


def test_finalized_note_not_editable(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]
    client.post(f"/notes/{note_id}/finalize", headers=H)

    r = client.patch(f"/notes/{note_id}", json={"soap_plan": "New plan."}, headers=H)
    assert r.status_code == 409


def test_finalized_note_injected_as_history(client):
    """After finalizing, the note must appear in the next SOAP generation's prompt."""
    patient = _make_patient(client)

    # First visit: generate + finalize
    note = _make_note(client, patient["id"])
    client.post(f"/notes/{note['note_id']}/finalize", headers=H)

    # Second visit: verify first visit context is in the LLM prompt
    mock_client = _mock_groq_client()
    with patch("backend.services._get_groq", return_value=mock_client):
        client.post("/notes/generate", json={
            "patient_id": patient["id"],
            "raw_input": "Second visit follow-up.",
            "input_mode": "typed",
        }, headers=H)

    system_msg = mock_client.chat.completions.create.call_args[1]["messages"][0]["content"]
    assert _VALID_SOAP["assessment"] in system_msg
    assert _VALID_SOAP["plan"] in system_msg


def test_finalize_note_not_found(client):
    r = client.post("/notes/00000000-0000-0000-0000-000000000000/finalize", headers=H)
    assert r.status_code == 404


# ── POST /notes/{id}/patient-summary ─────────────────────────────────────────

def test_patient_summary_generated(client):
    patient = _make_patient(client, full_name="Ali Khan")
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]
    client.post(f"/notes/{note_id}/finalize", headers=H)

    with patch("backend.services._get_groq", return_value=_mock_summary_client()):
        r = client.post(f"/notes/{note_id}/patient-summary", headers=H)

    assert r.status_code == 200
    data = r.json()
    assert data["note_id"] == note_id
    assert data["patient_summary"] == _SUMMARY_TEXT


def test_patient_summary_within_word_limit(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    client.post(f"/notes/{note['note_id']}/finalize", headers=H)

    with patch("backend.services._get_groq", return_value=_mock_summary_client()):
        r = client.post(f"/notes/{note['note_id']}/patient-summary", headers=H)

    summary = r.json()["patient_summary"]
    assert len(summary.split()) <= 150, f"Summary too long: {len(summary.split())} words"


def test_patient_summary_regenerate_overwrites(client):
    """Calling patient-summary twice must overwrite, not append."""
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]
    client.post(f"/notes/{note_id}/finalize", headers=H)

    with patch("backend.services._get_groq", return_value=_mock_summary_client()):
        client.post(f"/notes/{note_id}/patient-summary", headers=H)

    second_text = "Completely different summary on regeneration."
    second_mock = MagicMock()
    second_mock.chat.completions.create.return_value = MagicMock(
        choices=[MagicMock(message=MagicMock(content=second_text))]
    )
    with patch("backend.services._get_groq", return_value=second_mock):
        r = client.post(f"/notes/{note_id}/patient-summary", headers=H)

    assert r.json()["patient_summary"] == second_text


def test_patient_summary_stored_on_note(client):
    """After generating summary, GET /notes/{id} must return it in patient_summary field."""
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]
    client.post(f"/notes/{note_id}/finalize", headers=H)

    with patch("backend.services._get_groq", return_value=_mock_summary_client()):
        client.post(f"/notes/{note_id}/patient-summary", headers=H)

    r = client.get(f"/notes/{note_id}", headers=H)
    assert r.json()["patient_summary"] == _SUMMARY_TEXT


def test_patient_summary_not_found(client):
    r = client.post("/notes/00000000-0000-0000-0000-000000000000/patient-summary", headers=H)
    assert r.status_code == 404


# ── DELETE /notes/{id} ────────────────────────────────────────────────────────

def test_delete_note_soft(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    note_id = note["note_id"]

    r = client.delete(f"/notes/{note_id}", headers=H)
    assert r.status_code == 204

    # Note no longer accessible
    r = client.get(f"/notes/{note_id}", headers=H)
    assert r.status_code == 404


def test_delete_note_excluded_from_list(client):
    patient = _make_patient(client)
    note = _make_note(client, patient["id"])
    client.delete(f"/notes/{note['note_id']}", headers=H)

    r = client.get(f"/patients/{patient['id']}/notes", headers=H)
    assert r.json()["total"] == 0


def test_delete_note_not_found(client):
    r = client.delete("/notes/00000000-0000-0000-0000-000000000000", headers=H)
    assert r.status_code == 404
