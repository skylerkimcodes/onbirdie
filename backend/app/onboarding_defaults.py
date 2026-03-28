"""Fallbacks when employer documents omit optional onboarding config."""

from __future__ import annotations

DEFAULT_ROLE_OPTIONS: list[str] = [
    "Frontend Engineer",
    "Backend Engineer",
    "Full Stack Engineer",
    "DevOps / Infra",
    "Mobile Engineer",
    "Data Engineer",
    "Other",
]

# Paths are workspace-relative globs (used by the extension to surface files).
DEFAULT_HIGHLIGHT_PATHS: list[str] = [
    "README.md",
    "package.json",
    "src/",
    "backend/",
]
