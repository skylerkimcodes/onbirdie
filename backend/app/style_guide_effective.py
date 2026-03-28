"""Resolve which style guide text applies for a user.

Priority (each level replaces the entire set of rules below it):

1. **Personal** (`users.style_guide`) — employee override
2. **Employer** (`employers.style_guide`) — team override
3. **Demo default** — hardcoded Microsoft-style conventions when ``style_guide_use_microsoft_demo`` is True
4. Empty string if demo is off and nothing is stored
"""

from __future__ import annotations

from typing import Literal

from app.config import settings
from app.microsoft_style_guide_demo import MICROSOFT_STYLE_GUIDE_DEMO

EffectiveSource = Literal["personal", "employer", "demo", "none"]


def effective_style_guide_text(user: dict, employer: dict) -> str:
    personal = (user.get("style_guide") or "").strip()
    if personal:
        return personal
    team = (employer.get("style_guide") or "").strip()
    if team:
        return team
    if settings.style_guide_use_microsoft_demo:
        return MICROSOFT_STYLE_GUIDE_DEMO
    return ""


def effective_source(user: dict, employer: dict) -> EffectiveSource:
    if (user.get("style_guide") or "").strip():
        return "personal"
    if (employer.get("style_guide") or "").strip():
        return "employer"
    if settings.style_guide_use_microsoft_demo:
        return "demo"
    return "none"
