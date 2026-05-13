"""
services.py — all external API calls and business logic.

LLM section (this file, Part 3):
  build_visit_history_block()  — assembles prior-visit context
  llm_generate_soap()          — SOAP generation with retry + fallback

Whisper section (Part 4):
  transcribe_audio()           — audio → transcript via Groq Whisper

Summary section (Part 5):
  llm_generate_summary()       — SOAP → plain-English patient summary
"""

import json
import os
import tempfile
import time
import uuid
from dataclasses import dataclass, field

import ffmpeg
import structlog
from groq import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    Groq,
    RateLimitError,
)
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import settings
from backend.models import Note
from backend.prompts import SOAP_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT
from backend.schemas import SOAPOut

log = structlog.get_logger()


# ── Groq client ────────────────────────────────────────────────────────────────

_groq_client: Groq | None = None


def _get_groq() -> Groq:
    global _groq_client
    if _groq_client is None:
        _groq_client = Groq(
            api_key=settings.groq_api_key,
            timeout=float(settings.llm_timeout_seconds),
        )
    return _groq_client


# ── Internal chat helper ───────────────────────────────────────────────────────

def _llm_chat(
    system_prompt: str,
    user_content: str,
    json_mode: bool = False,
    model: str | None = None,
    timeout: float | None = None,
) -> str:
    """Send a chat request to Groq with exponential-backoff retry.

    Retries on rate-limit (429), 5xx errors, and timeouts.
    Raises the last exception if all attempts are exhausted.
    """
    client = _get_groq()
    resolved_model = model or settings.llm_model
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]
    create_kwargs: dict = {"messages": messages, "model": resolved_model}
    if json_mode:
        create_kwargs["response_format"] = {"type": "json_object"}
    if timeout is not None:
        create_kwargs["timeout"] = timeout

    last_exc: Exception | None = None
    for attempt in range(settings.llm_max_retries + 1):
        if attempt > 0:
            wait = 2 ** (attempt - 1)  # 1 s, 2 s
            log.warning("llm_retry", attempt=attempt, wait_seconds=wait, model=resolved_model)
            time.sleep(wait)
        try:
            response = client.chat.completions.create(**create_kwargs)
            return response.choices[0].message.content or ""
        except RateLimitError as e:
            log.warning("llm_rate_limited", attempt=attempt)
            last_exc = e
        except APIStatusError as e:
            if e.status_code >= 500:
                log.warning("llm_server_error", attempt=attempt, status=e.status_code)
                last_exc = e
            else:
                raise
        except (APITimeoutError, APIConnectionError) as e:
            log.warning("llm_connection_error", attempt=attempt, error=str(e))
            last_exc = e

    raise last_exc  # type: ignore[misc]


def _parse_soap(raw: str) -> SOAPOut:
    """Parse LLM output into SOAPOut. Raises json.JSONDecodeError or ValidationError on failure."""
    data = json.loads(raw)
    return SOAPOut.model_validate(data)


# ── History builder ────────────────────────────────────────────────────────────

def build_visit_history_block(patient_id: uuid.UUID, db: Session) -> str:
    """Return a text block of recent finalized visits for SOAP context injection.

    Token budget: rough 4 chars = 1 token estimate.
    Strategy: full detail → drop oldest → one-liner fallback.
    """
    notes = db.execute(
        select(Note)
        .where(
            Note.patient_id == patient_id,
            Note.status == "finalized",
            Note.deleted_at.is_(None),
        )
        .order_by(Note.finalized_at.desc())
        .limit(settings.history_visits_to_inject)
    ).scalars().all()

    if not notes:
        return "No prior visits on record."

    max_chars = settings.history_max_tokens * 4

    def _date(note: Note) -> str:
        ts = note.finalized_at or note.created_at
        return ts.strftime("%Y-%m-%d") if ts else "unknown"

    def _full_block(note: Note) -> str:
        assessment = note.soap_assessment or note.ai_assessment or "[Not documented]"
        plan = note.soap_plan or note.ai_plan or "[Not documented]"
        return f"Visit on {_date(note)}:\n  Assessment: {assessment}\n  Plan: {plan}"

    def _one_liner(note: Note) -> str:
        assessment = (note.soap_assessment or note.ai_assessment or "")[:60]
        return f"Visit {_date(note)}: {assessment}..."

    blocks = [_full_block(n) for n in notes]

    combined = "\n\n".join(blocks)
    if len(combined) <= max_chars:
        return combined

    # Drop oldest entries until within budget
    while len(blocks) > 1 and len("\n\n".join(blocks)) > max_chars:
        blocks.pop()
    combined = "\n\n".join(blocks)
    if len(combined) <= max_chars:
        return combined

    # Final fallback: one-liner per visit
    return "\n".join(_one_liner(n) for n in notes)


# ── SOAP generation ────────────────────────────────────────────────────────────

@dataclass
class SoapResult:
    soap: SOAPOut
    model: str
    generation_ms: int
    fallback_used: bool = field(default=False)


def llm_generate_soap(
    patient,  # Patient ORM instance
    history_block: str,
    raw_input: str,
    input_mode: str,
    vitals_text: str = "",
) -> SoapResult:
    """Generate a SOAP note from raw clinical input.

    Attempts:
      1. Normal call with JSON mode.
      2. Retry with a stricter suffix if JSON parse fails.
      3. Graceful fallback (raw input in subjective) if both fail.
    """
    effective_input = f"{vitals_text}\n\n{raw_input}".strip() if vitals_text else raw_input

    system_prompt = SOAP_SYSTEM_PROMPT.format(
        input_mode=input_mode,
        name=patient.full_name,
        age=patient.age,
        gender=patient.gender,
        allergies=patient.allergies or "None known",
        chronic_conditions=patient.chronic_conditions or "None documented",
        visit_history_block=history_block,
        raw_input=effective_input,
    )
    trigger = "Generate the SOAP note now as a JSON object."

    start = time.monotonic()

    # ── Attempt 1 ─────────────────────────────────────────────────────────────
    try:
        raw = _llm_chat(system_prompt, trigger, json_mode=True)
        soap = _parse_soap(raw)
        ms = int((time.monotonic() - start) * 1000)
        log.info("soap_generated", mode=input_mode, ms=ms, model=settings.llm_model)
        return SoapResult(soap=soap, model=settings.llm_model, generation_ms=ms)
    except (json.JSONDecodeError, ValidationError):
        log.warning("soap_parse_fail_will_retry")
    except Exception as e:
        log.error("soap_llm_error_will_retry", error=str(e))

    # ── Attempt 2 — stricter suffix ────────────────────────────────────────────
    stricter_prompt = (
        system_prompt
        + '\n\nCRITICAL: Return ONLY raw JSON. No markdown fences, no explanation. '
        'Exact format: {"subjective":"...","objective":"...","assessment":"...","plan":"..."}'
    )
    try:
        raw = _llm_chat(stricter_prompt, "JSON only:", json_mode=True)
        soap = _parse_soap(raw)
        ms = int((time.monotonic() - start) * 1000)
        log.info("soap_generated_on_retry", ms=ms)
        return SoapResult(soap=soap, model=settings.llm_model, generation_ms=ms)
    except Exception as e:
        log.error("soap_both_attempts_failed", error=str(e))

    # ── Graceful fallback ──────────────────────────────────────────────────────
    ms = int((time.monotonic() - start) * 1000)
    log.warning("soap_fallback_used", ms=ms)
    fallback = SOAPOut(
        subjective=(
            "[AI generation failed — please review the raw input below and fill in manually]\n\n"
            + effective_input[:5000]
        ),
        objective="[Not documented]",
        assessment="[Not documented]",
        plan="[Not documented]",
    )
    return SoapResult(soap=fallback, model=settings.llm_model, generation_ms=ms, fallback_used=True)


# ══════════════════════════════════════════════════════════════════════════════
# Whisper transcription (Part 4)
# ══════════════════════════════════════════════════════════════════════════════

ALLOWED_AUDIO_FORMATS: frozenset[str] = frozenset(
    {".mp3", ".wav", ".m4a", ".ogg", ".webm", ".flac"}
)


class TranscriptionError(Exception):
    """Raised by transcribe_audio() for known failure modes.

    The route handler converts this to an HTTPException with the right status code.
    """

    def __init__(self, code: str, message: str, status_code: int) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


@dataclass
class TranscriptionResult:
    transcript: str
    duration_seconds: float
    detected_language: str
    transcription_ms: int


def _probe_duration(audio_bytes: bytes, filename: str) -> float:
    """Write bytes to a NamedTemporaryFile, probe duration via ffprobe, delete immediately.

    Returns 0.0 if ffprobe is unavailable or the file is unreadable — Whisper handles it.
    The temp file is guaranteed to be removed before this function returns.
    """
    suffix = os.path.splitext(filename)[1] or ".tmp"
    # delete=False required on Windows: the file must be closed before ffprobe can open it.
    tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
    tmp_path = tmp.name
    try:
        tmp.write(audio_bytes)
        tmp.close()
        probe = ffmpeg.probe(tmp_path)
        return float(probe["format"]["duration"])
    except Exception:
        return 0.0  # Graceful degradation — Whisper's own limits apply
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


def _whisper_transcribe(audio_bytes: bytes, filename: str) -> tuple[str, str]:
    """Send audio bytes to Groq Whisper. Returns (transcript, detected_language).

    Uses verbose_json to capture the detected language even when `language="en"` is forced.
    Retries on rate-limit and 5xx errors with exponential backoff.
    """
    client = _get_groq()
    last_exc: Exception | None = None

    for attempt in range(settings.llm_max_retries + 1):
        if attempt > 0:
            wait = 2 ** (attempt - 1)
            log.warning("whisper_retry", attempt=attempt, wait_seconds=wait)
            time.sleep(wait)
        try:
            response = client.audio.transcriptions.create(
                file=(filename, audio_bytes),
                model=settings.whisper_model,
                language=settings.whisper_language,
                response_format="verbose_json",
                timeout=float(settings.whisper_timeout_seconds),
            )
            transcript = (response.text or "").strip()
            detected = getattr(response, "language", None) or settings.whisper_language
            return transcript, detected
        except RateLimitError as e:
            log.warning("whisper_rate_limited", attempt=attempt)
            last_exc = e
        except APIStatusError as e:
            if e.status_code >= 500:
                log.warning("whisper_server_error", attempt=attempt, status=e.status_code)
                last_exc = e
            else:
                raise TranscriptionError(
                    "whisper_error",
                    f"Transcription service returned an error. Please try again.",
                    502,
                )
        except (APITimeoutError, APIConnectionError) as e:
            log.warning("whisper_timeout_or_connection", attempt=attempt)
            last_exc = e

    raise TranscriptionError(
        "whisper_unavailable",
        "Transcription service is temporarily unavailable. Please re-record and try again.",
        502,
    )


def transcribe_audio(audio_bytes: bytes, filename: str, mode: str) -> TranscriptionResult:
    """Validate and transcribe audio. Raises TranscriptionError for all rejection cases.

    Validation order:
      1. Format check (extension)
      2. Size check (bytes)
      3. Duration check (ffprobe)
      4. Whisper call with retry
    """
    filename = (filename or "audio.mp3").lower()
    ext = os.path.splitext(filename)[1]

    if ext not in ALLOWED_AUDIO_FORMATS:
        raise TranscriptionError(
            "unsupported_format",
            f"Format '{ext}' is not supported. Accepted: {', '.join(sorted(ALLOWED_AUDIO_FORMATS))}",
            415,
        )

    max_bytes = settings.whisper_max_audio_mb * 1024 * 1024
    if len(audio_bytes) > max_bytes:
        raise TranscriptionError(
            "audio_too_large",
            f"Audio exceeds the {settings.whisper_max_audio_mb} MB limit.",
            413,
        )

    duration = _probe_duration(audio_bytes, filename)
    if duration > settings.whisper_max_audio_seconds:
        raise TranscriptionError(
            "audio_too_long",
            (
                f"Audio duration ({duration:.0f}s) exceeds the "
                f"{settings.whisper_max_audio_seconds // 60}-minute limit."
            ),
            400,
        )

    start = time.monotonic()
    transcript, detected_language = _whisper_transcribe(audio_bytes, filename)
    transcription_ms = int((time.monotonic() - start) * 1000)

    if detected_language and detected_language != settings.whisper_language:
        log.warning(
            "whisper_non_english_detected",
            detected=detected_language,
            forced=settings.whisper_language,
        )

    log.info(
        "audio_transcribed",
        mode=mode,
        duration_s=round(duration, 1),
        words=len(transcript.split()),
        lang=detected_language,
        ms=transcription_ms,
    )

    return TranscriptionResult(
        transcript=transcript,
        duration_seconds=duration,
        detected_language=detected_language,
        transcription_ms=transcription_ms,
    )


# ── Patient summary generation (added in Part 5) ───────────────────────────────

def llm_generate_summary(
    subjective: str,
    objective: str,
    assessment: str,
    plan: str,
    patient_first_name: str,
    visit_date: str,
) -> str:
    """Generate a plain-English patient summary from a finalized SOAP note."""
    system_prompt = SUMMARY_SYSTEM_PROMPT.format(
        subjective=subjective,
        objective=objective,
        assessment=assessment,
        plan=plan,
        patient_first_name=patient_first_name,
        visit_date=visit_date,
    )
    summary = _llm_chat(
        system_prompt,
        "Generate the patient summary now.",
        json_mode=False,
        timeout=float(settings.llm_timeout_seconds),
    )
    log.info("summary_generated", words=len(summary.split()))
    return summary.strip()
