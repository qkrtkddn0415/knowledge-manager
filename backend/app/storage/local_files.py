from pathlib import Path

from app.core.config import settings
from app.utils.hashing import sha256_bytes


def safe_original_path(document_public_id: str, suffix: str) -> Path:
    suffix = suffix.lower() if suffix.lower() in {".txt", ".md", ".pdf"} else ".txt"
    root = settings.originals_dir.resolve()
    path = (root / f"{document_public_id}{suffix}").resolve()
    if root not in path.parents:
        raise ValueError("invalid storage path")
    return path


def save_original(document_public_id: str, suffix: str, content: bytes) -> tuple[str, str]:
    path = safe_original_path(document_public_id, suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = settings.temp_dir / f"{document_public_id}.upload"
    temp.write_bytes(content)
    temp.replace(path)
    return str(path.relative_to(settings.data_dir.resolve())), sha256_bytes(content)


def delete_original(relative_path: str) -> None:
    root = settings.data_dir.resolve()
    path = (root / relative_path).resolve()
    if root not in path.parents:
        raise ValueError("invalid storage path")
    if path.exists():
        path.unlink()
