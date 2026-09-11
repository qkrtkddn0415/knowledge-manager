from app.core.errors import DomainError


def extract_text_from_pdf(raw: bytes) -> str:
    try:
        import pymupdf

        with pymupdf.open(stream=raw, filetype="pdf") as document:
            pages = [page.get_text("text", sort=True) for page in document]
    except Exception as exc:
        raise DomainError("INVALID_PDF", "PDF 파일을 읽을 수 없습니다.", 422) from exc
    content = "\n\f\n".join(pages).strip()
    if not content:
        raise DomainError("EMPTY_DOCUMENT", "텍스트가 포함된 PDF만 지원합니다. 이미지 스캔 PDF는 지원하지 않습니다.", 422)
    return content
