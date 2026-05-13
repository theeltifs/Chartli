# Chartli — AI Medical Scribe

> **Document Less. Care More.**

Chartli converts a doctor's typed notes, dictated voice, or doctor-patient conversation recording into a structured SOAP note — Subjective, Objective, Assessment, Plan — in seconds. It stores the full patient history and auto-generates a plain-English visit summary for the patient.

> **Disclaimer:** This is an MVP / portfolio project. It is not a regulated medical device, not HIPAA/GDPR compliant, and not a substitute for clinical judgment. Do not enter real patient data.

---

## Features

- **SOAP Note Generation** — Free-text or voice input → structured clinical note via Llama 3.3 70B on Groq
- **Audio Transcription** — Dictation or live doctor-patient conversation, transcribed via Whisper Large v3 Turbo
- **Patient Management** — Create and search patients with auto-generated display IDs (`P-2026-00001`)
- **Visit History Context** — Last 3 finalized visits are injected into every LLM prompt for continuity-aware notes
- **Patient Portal** — Shareable, PIN-free page where patients view their own finalized visit summaries
- **PIN Gate** — Lightweight clinic-level access control; no user accounts required
- **SQLite by default, Postgres-ready** — Zero-config locally; swap `DATABASE_URL` for production

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI, SQLAlchemy 2.0, Pydantic v2, Structlog |
| LLM | Llama 3.3 70B (`llama-3.3-70b-versatile`) via Groq |
| Transcription | Whisper Large v3 Turbo (`whisper-large-v3-turbo`) via Groq |
| Frontend | React 18, Vite 5 |
| Database | SQLite (dev) / PostgreSQL (prod) |
| Audio | ffmpeg (duration probing, format validation) |

---

## Project Structure

```
Chartli/
├── backend/
│   ├── main.py          # FastAPI app + all routes
│   ├── models.py        # SQLAlchemy ORM models (Patient, Note, IdSequence)
│   ├── schemas.py       # Pydantic request/response schemas
│   ├── services.py      # Groq LLM + Whisper + visit history logic
│   ├── prompts.py       # SOAP and summary system prompts
│   ├── database.py      # Engine, session factory, Base
│   ├── config.py        # pydantic-settings config
│   ├── auth.py          # PIN-based authentication dependency
│   └── test_main.py     # Test suite (89% coverage)
├── frontend-react/
│   ├── src/
│   │   ├── pages/       # Route-level pages (Today, PatientDetail, NewVisit, etc.)
│   │   ├── components/  # Shared UI components (Topbar, Sidebar, SoapEditor, VitalsForm…)
│   │   ├── hooks/       # useRecorder — mic recording hook
│   │   └── api.js       # Typed API client for the FastAPI backend
│   ├── index.html
│   └── package.json
├── .env.example
├── requirements.txt
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- [ffmpeg](https://ffmpeg.org/download.html) installed and on `PATH`
- A free [Groq API key](https://console.groq.com)

### 1. Clone the repo

```bash
git clone https://github.com/theeltifs/Chartli.git
cd Chartli
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```env
GROQ_API_KEY=gsk_your_key_here
CHARTLI_PIN=your_clinic_pin
DATABASE_URL=sqlite:///./chartli.db
```

### 3. Install backend dependencies

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 4. Start the backend

```bash
uvicorn backend.main:app --reload --port 8000
```

API docs at [http://localhost:8000/docs](http://localhost:8000/docs)

### 5. Start the frontend

```bash
cd frontend-react
npm install
npm run dev
```

Frontend at [http://localhost:5173](http://localhost:5173)

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GROQ_API_KEY` | **Yes** | — | Groq API key (LLM + Whisper) |
| `CHARTLI_PIN` | **Yes** | — | Clinic PIN shown at login |
| `DATABASE_URL` | **Yes** | `sqlite:///./chartli.db` | SQLAlchemy connection string |
| `LLM_MODEL` | No | `llama-3.3-70b-versatile` | Groq chat model |
| `LLM_TIMEOUT_SECONDS` | No | `30` | LLM request timeout |
| `LLM_MAX_RETRIES` | No | `2` | Retries on transient failure |
| `WHISPER_MODEL` | No | `whisper-large-v3-turbo` | Groq Whisper model |
| `WHISPER_LANGUAGE` | No | `en` | Transcription language hint |
| `WHISPER_MAX_AUDIO_MB` | No | `25` | Max upload size |
| `WHISPER_MAX_AUDIO_SECONDS` | No | `600` | Max audio duration |
| `HISTORY_VISITS_TO_INJECT` | No | `3` | Past visits injected into LLM context |
| `CLINIC_TIMEZONE` | No | `Asia/Karachi` | Timezone for display |
| `LOG_LEVEL` | No | `INFO` | Logging verbosity |

**PostgreSQL (production):**

```env
DATABASE_URL=postgresql+psycopg://user:pass@host:5432/chartli
```

---

## API Overview

All routes except `GET /health` and `GET /patient-access/{id}` require the `X-Chartli-Pin` header.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/patients` | Create patient |
| `GET` | `/patients/search` | Search by name or display ID |
| `GET` | `/patients/{id}` | Get patient |
| `PATCH` | `/patients/{id}` | Update patient |
| `DELETE` | `/patients/{id}` | Soft-delete patient |
| `GET` | `/patients/{id}/notes` | List patient notes |
| `GET` | `/notes/today` | All notes created today |
| `POST` | `/notes/generate` | Generate SOAP note |
| `GET` | `/notes/{id}` | Get note |
| `PATCH` | `/notes/{id}` | Edit draft note |
| `POST` | `/notes/{id}/finalize` | Lock note as finalized |
| `POST` | `/notes/{id}/patient-summary` | Generate patient-friendly summary |
| `DELETE` | `/notes/{id}` | Soft-delete note |
| `POST` | `/transcribe` | Transcribe audio file |
| `GET` | `/patient-access/{display_id}` | Public patient portal (no PIN) |

Error shape: `{ "error": { "code": "string", "message": "string" } }`

---

## Running Tests

```bash
pytest backend/test_main.py -v

# With coverage
pytest backend/test_main.py --cov=backend.main --cov=backend.services --cov-report=term-missing
```

Coverage: **89%** — `main.py` 98%, `services.py` 79%

---

## Known Limitations

- **Rate limits:** Groq free tier allows ~6,000 tokens/min. The app surfaces a friendly retry message and backs off automatically.
- **English only:** Whisper is called with `language="en"`. Non-English audio may produce reduced accuracy.
- **Single PIN auth:** One shared PIN protects all data. Not suitable for multi-provider clinics.
- **No audio retention:** Audio bytes live only in process memory during `/transcribe` — never written to disk or database.
- **SQLite in dev:** Not suitable for concurrent writes. Use PostgreSQL in production.

---

## Roadmap

- Streaming transcription (partial results while speaking)
- Speaker diarization (separate doctor vs. patient turns)
- Multilingual support (Urdu, Arabic, Hindi…)
- ICD-10 code suggestions in Assessment
- PDF export of SOAP + patient summary
- Semantic search over visit history (pgvector)
- Multi-doctor accounts with role-based access
- HIPAA / GDPR compliance posture

---

## License

MIT
