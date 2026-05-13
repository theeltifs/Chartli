import re
import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

# ── Enums ──────────────────────────────────────────────────────────────────────

class Gender(str, Enum):
    male = "male"
    female = "female"
    other = "other"
    prefer_not_to_say = "prefer_not_to_say"


class BloodGroup(str, Enum):
    a_pos = "A+"
    a_neg = "A-"
    b_pos = "B+"
    b_neg = "B-"
    o_pos = "O+"
    o_neg = "O-"
    ab_pos = "AB+"
    ab_neg = "AB-"
    unknown = "unknown"


class NoteStatus(str, Enum):
    draft = "draft"
    finalized = "finalized"


class InputMode(str, Enum):
    typed = "typed"
    dictation = "dictation"
    conversation = "conversation"


# ── Shared validators ──────────────────────────────────────────────────────────

_CONTACT_RE = re.compile(r"^\+?[0-9 \-]{7,20}$")


def _validate_contact(v: Optional[str]) -> Optional[str]:
    if v is not None and not _CONTACT_RE.match(v):
        raise ValueError(r"contact must match ^\+?[0-9 \-]{7,20}$")
    return v


def _validate_name(v: Optional[str]) -> Optional[str]:
    if v is not None:
        v = v.strip()
        if not v:
            raise ValueError("full_name cannot be empty or whitespace")
    return v


# ── Patient schemas ────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    age: int = Field(..., ge=0, le=130)
    gender: Gender
    blood_group: Optional[BloodGroup] = None
    allergies: Optional[str] = Field(None, max_length=1000)
    chronic_conditions: Optional[str] = Field(None, max_length=1000)
    contact: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str) -> str:
        result = _validate_name(v)
        assert result is not None
        return result

    @field_validator("contact")
    @classmethod
    def check_contact(cls, v: Optional[str]) -> Optional[str]:
        return _validate_contact(v)


class PatientUpdate(BaseModel):
    full_name: Optional[str] = Field(None, min_length=1, max_length=120)
    age: Optional[int] = Field(None, ge=0, le=130)
    gender: Optional[Gender] = None
    blood_group: Optional[BloodGroup] = None
    allergies: Optional[str] = Field(None, max_length=1000)
    chronic_conditions: Optional[str] = Field(None, max_length=1000)
    contact: Optional[str] = None

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: Optional[str]) -> Optional[str]:
        return _validate_name(v)

    @field_validator("contact")
    @classmethod
    def check_contact(cls, v: Optional[str]) -> Optional[str]:
        return _validate_contact(v)


class PatientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    display_id: str
    full_name: str
    age: int
    gender: Gender
    blood_group: Optional[BloodGroup] = None
    allergies: Optional[str] = None
    chronic_conditions: Optional[str] = None
    contact: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    deleted_at: Optional[datetime] = None


class PatientListOut(BaseModel):
    items: list[PatientOut]
    total: int
    limit: int
    offset: int


# ── Vitals (used in note generation) ──────────────────────────────────────────

class VitalsIn(BaseModel):
    bp: Optional[str] = Field(None, max_length=20, description="e.g. '145/95'")
    hr: Optional[int] = Field(None, ge=0, le=300, description="Heart rate bpm")
    temp_c: Optional[float] = Field(None, ge=30.0, le=45.0, description="Temperature °C")
    spo2: Optional[int] = Field(None, ge=0, le=100, description="SpO2 %")
    weight_kg: Optional[float] = Field(None, ge=0.0, le=500.0, description="Weight kg")

    def to_text(self) -> str:
        """Render vitals as a structured text block to prepend to raw_input."""
        lines: list[str] = ["[Vitals]"]
        if self.bp:
            lines.append(f"BP: {self.bp}")
        if self.hr is not None:
            lines.append(f"HR: {self.hr} bpm")
        if self.temp_c is not None:
            lines.append(f"Temp: {self.temp_c}°C")
        if self.spo2 is not None:
            lines.append(f"SpO2: {self.spo2}%")
        if self.weight_kg is not None:
            lines.append(f"Weight: {self.weight_kg} kg")
        return "\n".join(lines) if len(lines) > 1 else ""


# ── Note schemas (routes added in Parts 3–5) ──────────────────────────────────

class NoteGenerateRequest(BaseModel):
    patient_id: uuid.UUID
    raw_input: str = Field(..., min_length=1, max_length=10_000)
    input_mode: InputMode
    vitals: Optional[VitalsIn] = None
    chief_complaint: Optional[str] = Field(None, max_length=200)


class SOAPOut(BaseModel):
    subjective: str
    objective: str
    assessment: str
    plan: str


class NoteGenerateResponse(BaseModel):
    note_id: uuid.UUID
    soap: SOAPOut
    ai_model: str
    generation_ms: int
    status: NoteStatus


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    patient_id: uuid.UUID
    status: NoteStatus
    input_mode: InputMode
    chief_complaint: Optional[str] = None
    raw_input: str
    vitals_json: Optional[Any] = None

    ai_subjective: Optional[str] = None
    ai_objective: Optional[str] = None
    ai_assessment: Optional[str] = None
    ai_plan: Optional[str] = None

    soap_subjective: Optional[str] = None
    soap_objective: Optional[str] = None
    soap_assessment: Optional[str] = None
    soap_plan: Optional[str] = None

    patient_summary: Optional[str] = None
    ai_model: Optional[str] = None
    generation_ms: Optional[int] = None
    transcription_ms: Optional[int] = None
    audio_duration_seconds: Optional[float] = None

    created_at: datetime
    updated_at: datetime
    finalized_at: Optional[datetime] = None
    deleted_at: Optional[datetime] = None


class NoteListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: NoteStatus
    input_mode: InputMode
    chief_complaint: Optional[str] = None
    soap_assessment: Optional[str] = None
    created_at: datetime
    finalized_at: Optional[datetime] = None


class NoteListOut(BaseModel):
    items: list[NoteListItem]
    total: int
    limit: int
    offset: int


class NoteUpdateRequest(BaseModel):
    soap_subjective: Optional[str] = None
    soap_objective: Optional[str] = None
    soap_assessment: Optional[str] = None
    soap_plan: Optional[str] = None
    chief_complaint: Optional[str] = Field(None, max_length=200)


class TranscribeResponse(BaseModel):
    transcript: str
    duration_seconds: float
    detected_language: str
    transcription_ms: int


class PatientSummaryOut(BaseModel):
    note_id: uuid.UUID
    patient_summary: str
