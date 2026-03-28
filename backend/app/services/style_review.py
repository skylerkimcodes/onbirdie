"""Style-guide review against staged diffs or live file snapshots.

Token strategy: prefer **Lava + small model** (`lava_light`) for mechanical checks; reserve **K2**
for heavier reasoning elsewhere (codebase tours, explanations) when you wire LangGraph.
"""

from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from app.config import settings
from app.schemas import StyleReviewResponse
from app.services.lava_client import lava_forward_chat_completions, openai_message_content

logger = logging.getLogger(__name__)

MAX_DIFF_CHARS = 120_000
MAX_LIVE_CHARS = 100_000

SYSTEM_DIFF = """You are OnBirdie's **code** style reviewer for git diffs.

CRITICAL scope:
- Judge **source code style only** (formatting, naming, structure, braces, spacing, patterns).
- Do **NOT** apply documentation voice, marketing tone, "write with you", Oxford commas in prose, UI copy rules, or the Microsoft *Writing* Style Guide. If the provided style guide text does not mention it, do not flag it.
- **guide_quote** must quote or closely paraphrase a rule that actually appears in the style guide text below in the user message. If you cannot tie a finding to that text, do not report it.

Rules:
- Only flag issues supported by the style guide text supplied in the user message.
- If the diff is fine or the guide does not cover the change, return "issues": [] and a short positive summary.
- Prefer concrete fixes (what to change) and tie explanation to the cited guide rule.
- severity: "error" for likely review blockers; "warning" for consistency; "info" for optional polish.
- Return ONLY valid JSON (no markdown fences):
{"summary":"string","issues":[{"severity":"info|warning|error","file_path":"string or null","line_start":null,"line_hint":"string or null","guide_quote":"string","explanation":"string","suggestion":"string"}]}
Use null for line_start in diff reviews unless you can infer a line from diff context.
"""

SYSTEM_LIVE = """You are OnBirdie's **live code** style assistant for a single file.

CRITICAL scope:
- Judge **source code** against the style guide only (indentation, spacing after keywords, naming, braces, structure).
- Do **NOT** flag documentation voice, inclusive language in comments as a "style guide" unless the guide explicitly requires it. Do **NOT** invent rules about "you", Oxford commas, or writing tone unless they appear verbatim in the provided style guide text.
- **guide_quote** must come from the style guide text in the user message (short quoted phrase or heading). Never cite rules that are not in that text.

Rules:
- Flag issues only when they match a rule in the provided style guide (or its cross-language "spirit" section when the file is not C#).
- Set line_start to the 1-based line number when the issue is on a specific line; otherwise null.
- severity: "error" | "warning" | "info" as appropriate; prefer fewer, high-confidence issues over noise.
- Return ONLY valid JSON (no markdown fences):
{"summary":"string","issues":[{"severity":"info|warning|error","file_path":"string or null","line_start":number or null,"line_hint":"string or null","guide_quote":"string","explanation":"string","suggestion":"string"}]}
file_path should match the path given in the user message.
"""


def _strip_json_fence(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```(?:json)?\s*", "", t)
        t = re.sub(r"\s*```$", "", t)
    return t.strip()


def _build_user_block_diff(style_guide: str, diff_trimmed: str) -> str:
    guide_section = (
        style_guide.strip()
        if style_guide.strip()
        else "(No style guide text. Give only generic notes as info-level issues.)"
    )
    return f"""Style guide:
---
{guide_section}
---

Git diff (staged changes):
---
{diff_trimmed}
---
"""


def _language_hint(file_path: str) -> str:
    lower = file_path.lower()
    # Longer extensions first (e.g. .tsx before .ts).
    rules: list[tuple[tuple[str, ...], str]] = [
        ((".tsx",), "TypeScript (React)"),
        ((".ts",), "TypeScript"),
        ((".jsx",), "JavaScript (React)"),
        ((".js", ".mjs", ".cjs"), "JavaScript"),
        ((".py",), "Python"),
        ((".cs",), "C#"),
        ((".go",), "Go"),
        ((".rs",), "Rust"),
        ((".java",), "Java"),
    ]
    for suffixes, name in rules:
        if lower.endswith(suffixes):
            return name
    return "unknown — apply cross-language rules only"


def _build_user_block_live(style_guide: str, file_path: str, content: str) -> str:
    guide_section = (
        style_guide.strip()
        if style_guide.strip()
        else "(No style guide text. Give only generic notes as info-level issues.)"
    )
    lang = _language_hint(file_path)
    return f"""Style guide:
---
{guide_section}
---

File path: {file_path}
Language (for applying rules): {lang}

File content (line numbers are 1-based; first line is line 1):
---
{content}
---
"""


def _parse_style_json(payload: str) -> StyleReviewResponse:
    cleaned = _strip_json_fence(payload)
    try:
        data = json.loads(cleaned)
        return StyleReviewResponse.model_validate(data)
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Model returned non-JSON: {e}") from e
    except ValidationError as e:
        raise RuntimeError(f"Model JSON did not match schema: {e}") from e


async def _complete_with_k2(*, system: str, user_block: str) -> str:
    if not settings.k2_base_url.strip() or not settings.k2_api_key.strip():
        raise RuntimeError("K2 is not configured (set K2_BASE_URL and K2_API_KEY)")
    llm = ChatOpenAI(
        base_url=settings.k2_base_url.rstrip("/"),
        api_key=settings.k2_api_key,
        model=settings.k2_model,
        temperature=0.2,
    )
    messages = [
        SystemMessage(content=system),
        HumanMessage(content=user_block),
    ]
    raw = await llm.ainvoke(messages)
    return raw.content if isinstance(raw.content, str) else str(raw.content)


async def _complete_with_lava_light(*, system: str, user_block: str) -> str:
    if not settings.lava_secret_key.strip():
        raise RuntimeError("LAVA_SECRET_KEY is not set")
    upstream = (settings.lava_forward_upstream or "").strip()
    if not upstream:
        upstream = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"

    model = (settings.lava_light_model or settings.chat_model or "gpt-4o-mini").strip()

    body: dict = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_block},
        ],
        "response_format": {"type": "json_object"},
    }
    try:
        resp = await lava_forward_chat_completions(
            upstream_chat_completions_url=upstream,
            body=body,
            use_byok=True,
        )
    except RuntimeError:
        logger.info("Retrying Lava light call without response_format")
        body.pop("response_format", None)
        resp = await lava_forward_chat_completions(
            upstream_chat_completions_url=upstream,
            body=body,
            use_byok=True,
        )
    return openai_message_content(resp)


async def _run_model(*, system: str, user_block: str) -> StyleReviewResponse:
    tier = settings.style_review_tier.strip().lower()
    use_k2_only = tier == "k2"

    async def run_k2() -> StyleReviewResponse:
        text = await _complete_with_k2(system=system, user_block=user_block)
        result = _parse_style_json(text)
        return result.model_copy(update={"tier_used": "k2"})

    async def run_lava() -> StyleReviewResponse:
        text = await _complete_with_lava_light(system=system, user_block=user_block)
        result = _parse_style_json(text)
        return result.model_copy(update={"tier_used": "lava_light"})

    if use_k2_only:
        return await run_k2()

    if settings.lava_secret_key.strip():
        try:
            return await run_lava()
        except Exception as e:
            logger.warning("Lava light style review failed, falling back to K2 if configured: %s", e)
            if settings.k2_base_url.strip() and settings.k2_api_key.strip():
                return await run_k2()
            raise

    if settings.k2_base_url.strip() and settings.k2_api_key.strip():
        logger.info("LAVA_SECRET_KEY unset; using K2 for style review.")
        return await run_k2()

    raise RuntimeError(
        "No AI backend configured: set LAVA_SECRET_KEY for light-tier style review via Lava, "
        "or set K2_BASE_URL and K2_API_KEY (see backend/.env.example)."
    )


async def run_style_review(*, style_guide: str, diff: str) -> StyleReviewResponse:
    diff_trimmed = diff if len(diff) <= MAX_DIFF_CHARS else diff[:MAX_DIFF_CHARS]
    user_block = _build_user_block_diff(style_guide, diff_trimmed)
    return await _run_model(system=SYSTEM_DIFF, user_block=user_block)


async def run_style_review_live(*, style_guide: str, file_path: str, content: str) -> StyleReviewResponse:
    trimmed = content if len(content) <= MAX_LIVE_CHARS else content[:MAX_LIVE_CHARS]
    user_block = _build_user_block_live(style_guide, file_path, trimmed)
    return await _run_model(system=SYSTEM_LIVE, user_block=user_block)
