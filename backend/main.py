import logging
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, FastAPI, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.auth import require_pin
from backend.config import settings
from backend.database import Base, engine, get_db
from backend.models import IdSequence, Note, Patient
from backend.schemas import (
    InputMode,
    NoteGenerateRequest,
    NoteGenerateResponse,
    NoteListItem,
    NoteListOut,
    NoteOut,
    NoteStatus,
    NoteUpdateRequest,
    PatientCreate,
    PatientListOut,
    PatientOut,
    PatientSummaryOut,
    PatientUpdate,
    TranscribeResponse,
)
from backend.services import (
    TranscriptionError,
    build_visit_history_block,
    llm_generate_soap,
    llm_generate_summary,
    transcribe_audio,
)


# ── Logging ────────────────────────────────────────────────────────────────────

def _configure_logging() -> None:
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
    )
    structlog.configure(
        processors=[
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.ExceptionRenderer(),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, settings.log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


_configure_logging()
log = structlog.get_logger()


# ── Lifespan ───────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    safe_url = settings.database_url.split("@")[-1] if "@" in settings.database_url else settings.database_url
    log.info("database_initialized", url=safe_url)
    yield
    log.info("application_shutdown")


# ── Error helpers ──────────────────────────────────────────────────────────────

def error_response(
    code: str,
    message: str,
    details: Any = None,
    status_code: int = 500,
) -> JSONResponse:
    body: dict[str, Any] = {"error": {"code": code, "message": message}}
    if details is not None:
        body["error"]["details"] = details
    return JSONResponse(status_code=status_code, content=body)


def _not_found(entity: str = "Resource") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail={"code": "not_found", "message": f"{entity} not found"},
    )


# ── App ────────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Chartli API",
    description="AI-Powered Clinical Documentation Assistant",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Exception handlers ─────────────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict):
        return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})
    return error_response("error", str(exc.detail), status_code=exc.status_code)


def _serializable_errors(exc: RequestValidationError) -> list[dict]:
    """Pydantic v2 stores the raw Exception object in ctx['error'] — not JSON serializable."""
    safe = []
    for err in exc.errors():
        entry = dict(err)
        if "ctx" in entry and isinstance(entry["ctx"], dict):
            entry["ctx"] = {
                k: str(v) if isinstance(v, Exception) else v
                for k, v in entry["ctx"].items()
            }
        entry.pop("url", None)
        safe.append(entry)
    return safe


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return error_response(
        code="validation_error",
        message="Request validation failed",
        details=_serializable_errors(exc),
        status_code=422,
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.exception("unhandled_error", path=str(request.url.path), error=str(exc))
    return error_response("internal_error", "An unexpected error occurred", status_code=500)


# ── Public routes ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["infra"])
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "1.0.0"}


# ── Authenticated router ───────────────────────────────────────────────────────

api = APIRouter(dependencies=[Depends(require_pin)])


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _generate_display_id(db: Session) -> str:
    """Atomically increment per-year counter and return a display_id.

    Postgres: SELECT FOR UPDATE prevents concurrent duplicates.
    SQLite: file-level write lock provides equivalent serialization.
    """
    year = _utcnow().year
    stmt = select(IdSequence).where(IdSequence.year == year)
    if not settings.is_sqlite:
        stmt = stmt.with_for_update()

    seq = db.execute(stmt).scalar_one_or_none()
    if seq is None:
        seq = IdSequence(year=year, last_value=0)
        db.add(seq)
        db.flush()

    seq.last_value += 1
    db.flush()
    return f"P-{year}-{seq.last_value:05d}"


def _get_patient(id_or_display_id: str, db: Session) -> Patient:
    stmt = select(Patient).where(Patient.deleted_at.is_(None))
    try:
        uid = uuid.UUID(id_or_display_id)
        stmt = stmt.where(Patient.id == uid)
    except ValueError:
        stmt = stmt.where(Patient.display_id == id_or_display_id.upper())

    patient = db.execute(stmt).scalar_one_or_none()
    if patient is None:
        raise _not_found("Patient")
    return patient


def _get_note(note_id: uuid.UUID, db: Session) -> Note:
    note = db.execute(
        select(Note).where(Note.id == note_id, Note.deleted_at.is_(None))
    ).scalar_one_or_none()
    if note is None:
        raise _not_found("Note")
    return note


# ══════════════════════════════════════════════════════════════════════════════
# Patient routes
# ══════════════════════════════════════════════════════════════════════════════

@api.get("/notes/today", tags=["notes"])
async def notes_today(db: Session = Depends(get_db)):
    """All notes created today (UTC), with basic patient info attached."""
    from datetime import date
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = db.execute(
        select(Note, Patient)
        .join(Patient, Note.patient_id == Patient.id)
        .where(
            Note.created_at >= today_start,
            Note.deleted_at.is_(None),
            Patient.deleted_at.is_(None),
        )
        .order_by(Note.created_at.desc())
    ).all()
    return {
        "date": today_start.date().isoformat(),
        "items": [
            {
                "note_id": str(n.id),
                "patient_id": str(p.id),
                "patient_display_id": p.display_id,
                "patient_full_name": p.full_name,
                "patient_allergies": p.allergies,
                "status": n.status,
                "input_mode": n.input_mode,
                "chief_complaint": n.chief_complaint,
                "created_at": n.created_at.isoformat(),
            }
            for n, p in rows
        ],
    }


@api.post("/patients", response_model=PatientOut, status_code=status.HTTP_201_CREATED, tags=["patients"])
async def create_patient(body: PatientCreate, db: Session = Depends(get_db)) -> PatientOut:
    display_id = _generate_display_id(db)
    patient = Patient(
        display_id=display_id,
        full_name=body.full_name,
        age=body.age,
        gender=body.gender.value,
        blood_group=body.blood_group.value if body.blood_group else None,
        allergies=body.allergies,
        chronic_conditions=body.chronic_conditions,
        contact=body.contact,
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    log.info("patient_created", display_id=display_id)
    return PatientOut.model_validate(patient)


# NOTE: /patients/search MUST be registered before /patients/{id_or_display_id}
@api.get("/patients/search", response_model=PatientListOut, tags=["patients"])
async def search_patients(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    include_deleted: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> PatientListOut:
    stmt = select(Patient)
    if not include_deleted:
        stmt = stmt.where(Patient.deleted_at.is_(None))

    if q.strip():
        search = q.strip()
        stmt = stmt.where(
            or_(
                Patient.full_name.ilike(f"%{search}%"),
                Patient.display_id == search.upper(),
            )
        )
    else:
        stmt = stmt.order_by(Patient.updated_at.desc())

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    patients = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
    return PatientListOut(
        items=[PatientOut.model_validate(p) for p in patients],
        total=total,
        limit=limit,
        offset=offset,
    )


@api.get("/patients/{id_or_display_id}", response_model=PatientOut, tags=["patients"])
async def get_patient(id_or_display_id: str, db: Session = Depends(get_db)) -> PatientOut:
    return PatientOut.model_validate(_get_patient(id_or_display_id, db))


@api.patch("/patients/{patient_id}", response_model=PatientOut, tags=["patients"])
async def update_patient(
    patient_id: uuid.UUID,
    body: PatientUpdate,
    db: Session = Depends(get_db),
) -> PatientOut:
    patient = _get_patient(str(patient_id), db)
    for field_name, value in body.model_dump(exclude_unset=True).items():
        setattr(patient, field_name, value.value if hasattr(value, "value") else value)
    patient.updated_at = _utcnow()
    db.commit()
    db.refresh(patient)
    log.info("patient_updated", patient_id=str(patient_id))
    return PatientOut.model_validate(patient)


@api.delete("/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["patients"])
async def delete_patient(patient_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    patient = _get_patient(str(patient_id), db)
    patient.deleted_at = _utcnow()
    patient.updated_at = _utcnow()
    db.commit()
    log.info("patient_soft_deleted", patient_id=str(patient_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ══════════════════════════════════════════════════════════════════════════════
# Note routes — list per patient
# ══════════════════════════════════════════════════════════════════════════════

@api.get("/patients/{patient_id}/notes", response_model=NoteListOut, tags=["notes"])
async def list_patient_notes(
    patient_id: uuid.UUID,
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> NoteListOut:
    _get_patient(str(patient_id), db)  # 404 if patient doesn't exist

    stmt = select(Note).where(
        Note.patient_id == patient_id,
        Note.deleted_at.is_(None),
    )
    if status:
        stmt = stmt.where(Note.status == status)
    stmt = stmt.order_by(Note.created_at.desc())

    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    notes = db.execute(stmt.offset(offset).limit(limit)).scalars().all()
    return NoteListOut(
        items=[NoteListItem.model_validate(n) for n in notes],
        total=total,
        limit=limit,
        offset=offset,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Note routes — SOAP generation
# ══════════════════════════════════════════════════════════════════════════════

@api.post("/notes/generate", response_model=NoteGenerateResponse, tags=["notes"])
async def generate_note(
    body: NoteGenerateRequest,
    db: Session = Depends(get_db),
) -> NoteGenerateResponse:
    patient = _get_patient(str(body.patient_id), db)
    vitals_text = body.vitals.to_text() if body.vitals else ""
    history_block = build_visit_history_block(body.patient_id, db)

    result = llm_generate_soap(
        patient=patient,
        history_block=history_block,
        raw_input=body.raw_input,
        input_mode=body.input_mode.value,
        vitals_text=vitals_text,
    )

    note = Note(
        patient_id=patient.id,
        status="draft",
        input_mode=body.input_mode.value,
        chief_complaint=body.chief_complaint,
        raw_input=body.raw_input,
        vitals_json=body.vitals.model_dump() if body.vitals else None,
        ai_subjective=result.soap.subjective,
        ai_objective=result.soap.objective,
        ai_assessment=result.soap.assessment,
        ai_plan=result.soap.plan,
        soap_subjective=result.soap.subjective,
        soap_objective=result.soap.objective,
        soap_assessment=result.soap.assessment,
        soap_plan=result.soap.plan,
        ai_model=result.model,
        generation_ms=result.generation_ms,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    log.info(
        "note_generated",
        note_id=str(note.id),
        mode=body.input_mode.value,
        fallback=result.fallback_used,
        ms=result.generation_ms,
    )

    return NoteGenerateResponse(
        note_id=note.id,
        soap=result.soap,
        ai_model=result.model,
        generation_ms=result.generation_ms,
        status=NoteStatus.draft,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Transcribe route
# ══════════════════════════════════════════════════════════════════════════════

_VALID_MODES = {"dictation", "conversation"}


@api.post("/transcribe", response_model=TranscribeResponse, tags=["transcribe"])
async def transcribe_audio_endpoint(
    audio: UploadFile,
    mode: str = Form(...),
) -> TranscribeResponse:
    if mode not in _VALID_MODES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "invalid_mode",
                "message": f"mode must be one of: {', '.join(sorted(_VALID_MODES))}",
            },
        )

    audio_bytes = await audio.read()
    filename = audio.filename or "audio.mp3"

    try:
        result = transcribe_audio(audio_bytes, filename, mode)
    except TranscriptionError as e:
        raise HTTPException(
            status_code=e.status_code,
            detail={"code": e.code, "message": e.message},
        )

    log.info(
        "transcribe_complete",
        mode=mode,
        duration_s=result.duration_seconds,
        lang=result.detected_language,
        ms=result.transcription_ms,
    )

    return TranscribeResponse(
        transcript=result.transcript,
        duration_seconds=result.duration_seconds,
        detected_language=result.detected_language,
        transcription_ms=result.transcription_ms,
    )


# ══════════════════════════════════════════════════════════════════════════════
# Individual note ops
# ══════════════════════════════════════════════════════════════════════════════

@api.get("/notes/{note_id}", response_model=NoteOut, tags=["notes"])
async def get_note(note_id: uuid.UUID, db: Session = Depends(get_db)) -> NoteOut:
    return NoteOut.model_validate(_get_note(note_id, db))


@api.patch("/notes/{note_id}", response_model=NoteOut, tags=["notes"])
async def update_note(
    note_id: uuid.UUID,
    body: NoteUpdateRequest,
    db: Session = Depends(get_db),
) -> NoteOut:
    note = _get_note(note_id, db)
    if note.status == "finalized":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "note_finalized", "message": "Finalized notes cannot be edited"},
        )
    for field_name, value in body.model_dump(exclude_unset=True).items():
        setattr(note, field_name, value)
    note.updated_at = _utcnow()
    db.commit()
    db.refresh(note)
    log.info("note_updated", note_id=str(note_id))
    return NoteOut.model_validate(note)


@api.post("/notes/{note_id}/finalize", response_model=NoteOut, tags=["notes"])
async def finalize_note(note_id: uuid.UUID, db: Session = Depends(get_db)) -> NoteOut:
    note = _get_note(note_id, db)
    if note.status == "finalized":
        # Idempotent — already finalized is not an error
        return NoteOut.model_validate(note)
    note.status = "finalized"
    note.finalized_at = _utcnow()
    note.updated_at = _utcnow()
    db.commit()
    db.refresh(note)
    log.info("note_finalized", note_id=str(note_id))
    return NoteOut.model_validate(note)


@api.post("/notes/{note_id}/patient-summary", response_model=PatientSummaryOut, tags=["notes"])
async def generate_patient_summary(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
) -> PatientSummaryOut:
    note = _get_note(note_id, db)
    patient = db.get(Patient, note.patient_id)

    first_name = patient.full_name.split()[0] if patient else "Patient"
    ts = note.finalized_at or note.created_at
    visit_date = ts.strftime("%B %d, %Y") if ts else "Unknown"

    summary = llm_generate_summary(
        subjective=note.soap_subjective or "[Not documented]",
        objective=note.soap_objective or "[Not documented]",
        assessment=note.soap_assessment or "[Not documented]",
        plan=note.soap_plan or "[Not documented]",
        patient_first_name=first_name,
        visit_date=visit_date,
    )

    note.patient_summary = summary
    note.updated_at = _utcnow()
    db.commit()
    log.info("patient_summary_generated", note_id=str(note_id))
    return PatientSummaryOut(note_id=note_id, patient_summary=summary)


@api.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["notes"])
async def delete_note(note_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    note = _get_note(note_id, db)
    note.deleted_at = _utcnow()
    note.updated_at = _utcnow()
    db.commit()
    log.info("note_soft_deleted", note_id=str(note_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


app.include_router(api)


# ══════════════════════════════════════════════════════════════════════════════
# Public patient-access route (no PIN — patient-facing)
# Returns only finalized visits + patient summaries. No clinical SOAP data.
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/patient-access/{display_id}", tags=["patient-portal"])
async def patient_access(display_id: str, db: Session = Depends(get_db)):
    try:
        patient = _get_patient(display_id.upper(), db)
    except HTTPException:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "not_found", "message": "No patient found with that ID. Please check and try again."},
        )

    notes = db.execute(
        select(Note).where(
            Note.patient_id == patient.id,
            Note.status == "finalized",
            Note.deleted_at.is_(None),
        ).order_by(Note.created_at.desc())
    ).scalars().all()

    visits = []
    for note in notes:
        ts = note.finalized_at or note.created_at
        visits.append({
            "id": str(note.id),
            "date": ts.strftime("%B %d, %Y"),
            "chief_complaint": note.chief_complaint,
            "patient_summary": note.patient_summary,
        })

    return {
        "display_id": patient.display_id,
        "full_name": patient.full_name,
        "visits": visits,
    }
