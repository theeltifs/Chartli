from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Required ───────────────────────────────────────────────────────────────
    groq_api_key: str
    chartli_pin: str
    database_url: str = "sqlite:///./chartli.db"

    # ── LLM ────────────────────────────────────────────────────────────────────
    llm_model: str = "llama-3.3-70b-versatile"
    llm_timeout_seconds: int = 30
    llm_max_retries: int = 2

    # ── Whisper ────────────────────────────────────────────────────────────────
    whisper_model: str = "whisper-large-v3-turbo"
    whisper_language: str = "en"
    whisper_timeout_seconds: int = 30
    whisper_max_audio_mb: int = 25
    whisper_max_audio_seconds: int = 600

    # ── Context injection ──────────────────────────────────────────────────────
    history_visits_to_inject: int = 3
    history_max_tokens: int = 6000

    # ── Misc ───────────────────────────────────────────────────────────────────
    log_level: str = "INFO"
    clinic_timezone: str = "Asia/Karachi"

    @field_validator("chartli_pin")
    @classmethod
    def pin_min_length(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("CHARTLI_PIN must be at least 6 characters")
        return v

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


settings = Settings()
