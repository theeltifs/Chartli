import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Patient ────────────────────────────────────────────────────────────────────

class Patient(Base):
    __tablename__ = "patients"
    __table_args__ = (
        CheckConstraint("age >= 0 AND age <= 130", name="ck_patients_age"),
        CheckConstraint(
            "gender IN ('male','female','other','prefer_not_to_say')",
            name="ck_patients_gender",
        ),
        CheckConstraint(
            "blood_group IS NULL OR blood_group IN "
            "('A+','A-','B+','B-','O+','O-','AB+','AB-','unknown')",
            name="ck_patients_blood_group",
        ),
        Index("ix_patients_display_id", "display_id", unique=True),
        Index("ix_patients_deleted_at", "deleted_at"),
        Index("ix_patients_full_name", "full_name"),
        Index("ix_patients_updated_at", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    display_id: Mapped[str] = mapped_column(String(20), nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    age: Mapped[int] = mapped_column(Integer, nullable=False)
    gender: Mapped[str] = mapped_column(String(20), nullable=False)
    blood_group: Mapped[str | None] = mapped_column(String(10), nullable=True)
    allergies: Mapped[str | None] = mapped_column(Text, nullable=True)
    chronic_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    contact: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    notes: Mapped[list["Note"]] = relationship("Note", back_populates="patient", lazy="select")


# ── Note ───────────────────────────────────────────────────────────────────────

class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','finalized')",
            name="ck_notes_status",
        ),
        CheckConstraint(
            "input_mode IN ('typed','dictation','conversation')",
            name="ck_notes_input_mode",
        ),
        Index("ix_notes_patient_finalized", "patient_id", "finalized_at"),
        Index("ix_notes_status", "status"),
        Index("ix_notes_deleted_at", "deleted_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("patients.id"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    input_mode: Mapped[str] = mapped_column(String(20), nullable=False)
    chief_complaint: Mapped[str | None] = mapped_column(String(200), nullable=True)
    raw_input: Mapped[str] = mapped_column(Text, nullable=False)
    vitals_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    # AI-original output — set once at generation, never mutated
    ai_subjective: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_plan: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Doctor-editable SOAP — starts as copy of ai_*, updated via PATCH
    soap_subjective: Mapped[str | None] = mapped_column(Text, nullable=True)
    soap_objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    soap_assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    soap_plan: Mapped[str | None] = mapped_column(Text, nullable=True)

    patient_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(60), nullable=True)
    generation_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    transcription_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    audio_duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    patient: Mapped["Patient"] = relationship("Patient", back_populates="notes")


# ── IdSequence ─────────────────────────────────────────────────────────────────

class IdSequence(Base):
    """Monotonic counter per calendar year for generating display_ids."""

    __tablename__ = "id_sequences"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
