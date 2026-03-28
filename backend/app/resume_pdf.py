"""Extract plain text from PDF bytes (resume upload)."""

from __future__ import annotations

import io

from pypdf import PdfReader


def extract_pdf_plain_text(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        t = page.extract_text()
        if t:
            parts.append(t)
    return "\n".join(parts).strip()
