from app.models import DocumentChunk
from app.utils.text import normalize_text


def map_external_chunk(content: str, chunks: list[DocumentChunk]) -> tuple[DocumentChunk | None, str]:
    target = normalize_text(content)
    if not target:
        return None, "unresolved"
    for chunk in chunks:
        if target in normalize_text(chunk.text) or normalize_text(chunk.text) in target:
            return chunk, "exact"
    target_words = set(target.split())
    best: tuple[DocumentChunk | None, float] = (None, 0)
    for chunk in chunks:
        words = set(normalize_text(chunk.text).split())
        score = len(target_words & words) / max(len(target_words), 1)
        if score > best[1]:
            best = (chunk, score)
    return (best[0], "overlap") if best[1] >= 0.35 else (None, "unresolved")
