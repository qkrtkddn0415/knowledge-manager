from __future__ import annotations

import html
import ipaddress
import re
import socket
from html.parser import HTMLParser
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

from app.core.errors import DomainError

MAX_BYTES = 5 * 1024 * 1024
TIMEOUT_SECONDS = 15
ALLOWED_CONTENT_TYPES = {"text/plain", "text/html", "application/xhtml+xml"}


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []
        self.title_parts: list[str] = []
        self.skip_depth = 0
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript", "svg"}:
            self.skip_depth += 1
        if tag == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript", "svg"} and self.skip_depth:
            self.skip_depth -= 1
        if tag == "title":
            self.in_title = False
        if tag in {"p", "div", "br", "li", "h1", "h2", "h3", "section", "article"} and self.skip_depth == 0:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        value = html.unescape(data).strip()
        if not value:
            return
        self.parts.append(value)
        if self.in_title:
            self.title_parts.append(value)


def _validate_public_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise DomainError("WEB_SOURCE_URL_INVALID", "공개 HTTP(S) URL만 자료로 저장할 수 있습니다.", 422)
    hostname = parsed.hostname.rstrip(".").lower()
    if hostname in {"localhost", "localhost.localdomain"} or hostname.endswith(".local"):
        raise DomainError("WEB_SOURCE_PRIVATE_NETWORK", "로컬 네트워크 주소는 자료로 저장할 수 없습니다.", 422)
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(hostname, parsed.port or (443 if parsed.scheme == "https" else 80), type=socket.SOCK_STREAM)}
        if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
            raise DomainError("WEB_SOURCE_PRIVATE_NETWORK", "사설망·루프백·예약 IP 주소는 자료로 저장할 수 없습니다.", 422)
    except socket.gaierror as exc:
        raise DomainError("WEB_SOURCE_UNREACHABLE", "웹 출처의 호스트를 확인할 수 없습니다.", 422) from exc
    return value.strip()


class _SafeRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_public_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch_web_source(url: str) -> dict[str, str]:
    safe_url = _validate_public_url(url)
    request = Request(safe_url, headers={"User-Agent": "SecondBrain/1.0 (explicit knowledge import)"})
    try:
        with build_opener(_SafeRedirectHandler).open(request, timeout=TIMEOUT_SECONDS) as response:
            content_type = response.headers.get_content_type()
            if content_type not in ALLOWED_CONTENT_TYPES:
                raise DomainError("WEB_SOURCE_UNSUPPORTED", "HTML 또는 일반 텍스트 웹 페이지만 자료로 저장할 수 있습니다.", 422)
            raw = response.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                raise DomainError("WEB_SOURCE_TOO_LARGE", "웹 출처의 본문이 5 MiB 제한을 초과합니다.", 413)
            charset = response.headers.get_content_charset() or "utf-8"
    except DomainError:
        raise
    except Exception as exc:
        raise DomainError("WEB_SOURCE_FETCH_FAILED", "웹 출처를 가져오지 못했습니다. URL과 네트워크 상태를 확인하세요.", 502) from exc

    text = raw.decode(charset, errors="replace")
    title = ""
    if content_type in {"text/html", "application/xhtml+xml"}:
        parser = _TextExtractor()
        parser.feed(text)
        title = re.sub(r"\s+", " ", " ".join(parser.title_parts)).strip()
        text = "\n".join(line.strip() for line in " ".join(parser.parts).splitlines() if line.strip())
    else:
        text = text.strip()
    if not text:
        raise DomainError("EMPTY_DOCUMENT", "웹 출처에서 저장할 본문을 찾지 못했습니다.", 422)
    return {"url": safe_url, "title": title[:200], "text": text}
