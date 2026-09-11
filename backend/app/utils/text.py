import re
import unicodedata


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFC", value).replace("\r\n", "\n").replace("\r", "\n")
    return re.sub(r"[ \t]+", " ", value).strip()


def normalize_key(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^0-9a-z가-힣]+", "", value)


def split_chunks(text: str, size: int = 24_000, overlap: int = 500) -> list[dict[str, int | str]]:
    if not text:
        return []
    overlap = min(overlap, max(size - 1, 0))
    chunks: list[dict[str, int | str]] = []
    start = 0
    ordinal = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = max(text.rfind("\n\n", start + size // 2, end), text.rfind("\n", start + size // 2, end))
            if boundary > start:
                end = boundary
        piece = text[start:end]
        if piece:
            chunks.append({"ordinal": ordinal, "start_char": start, "end_char": end, "text": piece})
            ordinal += 1
        if end >= len(text):
            break
        next_start = end - overlap
        start = next_start if next_start > start else end
    return chunks


def excerpt(text: str, limit: int = 360) -> str:
    value = " ".join(text.split())
    return value if len(value) <= limit else value[: limit - 1].rstrip() + "…"
