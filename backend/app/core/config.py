from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Second Brain"
    environment: str = "development"
    database_url: str = "sqlite:///./database.db"
    data_dir: Path = Path("./data")
    frontend_origin: str = "http://localhost:5173"
    openai_api_key: str | None = None
    openai_model: str = "gpt-5-mini"
    openai_extraction_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    openai_vector_store_id: str | None = None
    openai_timeout_seconds: float = Field(default=60, gt=0, le=300)
    openai_max_retries: int = Field(default=2, ge=0, le=5)
    openai_extraction_workers: int = Field(default=3, ge=1, le=8)
    openai_extraction_max_output_tokens: int = Field(default=20_000, ge=4_000, le=32_000)
    openai_extraction_gap_pass: bool = True
    openai_extraction_gap_min_chars: int = Field(default=9_000, ge=1_000)
    openai_extraction_gap_min_concepts: int = Field(default=8, ge=1, le=100)
    agent_max_turns: int = Field(default=30, ge=1, le=100)
    agent_max_tool_calls: int = Field(default=30, ge=1, le=100)
    agent_max_calls_per_cycle: int = Field(default=8, ge=1, le=20)
    agent_run_timeout_seconds: float = Field(default=300, gt=0, le=1800)
    agent_max_output_chars: int = Field(default=24000, ge=1000, le=100000)
    agent_allow_web_search: bool = True
    max_document_bytes: int = Field(default=512 * 1024 * 1024, gt=0)
    chunk_size_chars: int = Field(default=24_000, gt=100)
    chunk_overlap_chars: int = Field(default=500, ge=0)
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=1, le=65535)

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def originals_dir(self) -> Path:
        return self.data_dir / "originals"

    @property
    def temp_dir(self) -> Path:
        return self.data_dir / "temp"

    @property
    def exports_dir(self) -> Path:
        return self.data_dir / "exports"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
