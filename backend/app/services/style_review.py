"""Style-guide review against staged diffs or live file snapshots.

Routing (when K2 is configured for chat/plan/tour):
- **Style review** defaults to **Lava + light model** (`STYLE_REVIEW_TIER=lava_light`, `LAVA_LIGHT_MODEL` or `CHAT_MODEL`) — cheaper mechanical JSON over diffs.
- Set `STYLE_REVIEW_TIER=k2` to run the same task on K2 instead.

Lava is the **gateway** (forward proxy); the actual model is the upstream id (e.g. Gemini) passed in the request body.
"""

from __future__ import annotations

import json
import logging
import re

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import ValidationError

from app.chat_service import strip_thinking_tags
from app.config import settings
from app.schemas import StyleIssue, StyleReviewResponse
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
- Do **NOT** flag documentation voice or writing-tone rules. **guide_quote** must come from the style guide text in the user message.

Line numbers (required):
- The user message contains numbered lines: `    N | ...` where **N** is the 1-based line number.
- For EVERY issue you output, set **line_start** to that **N** for the line where the problem appears.
- If one line has multiple distinct problems, you may output multiple issues with the same line_start.
- Do **not** set line_start to 1 for everything; copy **N** from the listing.

JavaScript / TypeScript naming (avoid false positives):
- `const` / `let` locals and `require()` bindings are usually **camelCase** (`userRoutes`, `verifyToken`, `myHelper`). **Do not** flag a name that is already valid camelCase (starts with lowercase, no spaces).
- **Never** emit a suggestion that renames an identifier to the exact same spelling (e.g. "Rename 'x' to 'x'").
- PascalCase (`App`, `MyClass`) may be used for components or intentional module-style names; do not flag those unless the style guide explicitly forbids them for that construct.

Quality:
- Prefer **fewer** issues with high confidence. If unsure, omit the issue.
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


def _first_json_dict(text: str) -> dict | None:
    """Parse the first JSON object in *text* (models often add prose before/after)."""
    dec = json.JSONDecoder()
    for i, ch in enumerate(text):
        if ch != "{":
            continue
        try:
            val, _ = dec.raw_decode(text, i)
        except json.JSONDecodeError:
            continue
        if isinstance(val, dict):
            return val
    return None


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


def _format_numbered_source(content: str) -> str:
    """Prefix each line with its 1-based line number so the model returns accurate line_start."""
    lines = content.splitlines()
    return "\n".join(f"{i + 1:5d} | {line}" for i, line in enumerate(lines))


def _build_user_block_live(style_guide: str, file_path: str, content: str) -> str:
    guide_section = (
        style_guide.strip()
        if style_guide.strip()
        else "(No style guide text. Give only generic notes as info-level issues.)"
    )
    lang = _language_hint(file_path)
    numbered = _format_numbered_source(content)
    return f"""Style guide:
---
{guide_section}
---

File path: {file_path}
Language (for applying rules): {lang}

Numbered source — use the integer before `|` as **line_start** in your JSON (1-based):
---
{numbered}
---
"""


def _parse_style_json(payload: str) -> StyleReviewResponse:
    raw = (payload or "").strip()
    if not raw:
        raise RuntimeError(
            "Style review model returned an empty response. "
            "Try again, or verify K2 / Lava keys and that the upstream model is reachable."
        )

    cleaned = _strip_json_fence(raw)
    attempts: list[str] = []
    for part in (cleaned, raw):
        if part and part not in attempts:
            attempts.append(part)

    last_json_err: json.JSONDecodeError | None = None
    for part in attempts:
        try:
            data = json.loads(part)
            return StyleReviewResponse.model_validate(data)
        except json.JSONDecodeError as e:
            last_json_err = e
        except ValidationError as e:
            raise RuntimeError(f"Model JSON did not match schema: {e}") from e

    loose = _first_json_dict(raw)
    if loose is not None:
        try:
            return StyleReviewResponse.model_validate(loose)
        except ValidationError as e:
            raise RuntimeError(f"Model JSON did not match schema: {e}") from e

    preview = raw[:500] if len(raw) > 500 else raw
    raise RuntimeError(
        f"Model returned non-JSON: {last_json_err}. Preview: {preview!r}"
    ) from last_json_err


_JS_TS_LANG = frozenset(
    {
        "JavaScript",
        "JavaScript (React)",
        "TypeScript",
        "TypeScript (React)",
    }
)


def _is_duplicate_rename_suggestion(blob: str) -> bool:
    for m in re.finditer(
        r"(?:[Rr]ename|[Cc]hange)\s+[`'\"]?(\w+)[`'\"]?\s+to\s+[`'\"]?(\w+)[`'\"]?", blob
    ):
        if m.group(1) == m.group(2):
            return True
    return False


def _is_spurious_camelcase_flag(blob: str) -> bool:
    """Model often flags valid camelCase locals; drop those."""
    if "camelcase" not in blob.lower():
        return False
    vm = re.search(
        r"(?:variable|identifier|binding|The)\s+[`'\"]([a-zA-Z_$][\w$]*)[`'\"]",
        blob,
        re.I,
    )
    if not vm:
        return False
    name = vm.group(1)
    return bool(re.match(r"^[a-z][a-zA-Z0-9_$]*$", name))


def _filter_spurious_issues(issues: list[StyleIssue], *, lang: str) -> list[StyleIssue]:
    out: list[StyleIssue] = []
    for issue in issues:
        blob = f"{issue.explanation} {issue.suggestion}"
        if _is_duplicate_rename_suggestion(blob):
            logger.debug("Dropped duplicate-rename style issue")
            continue
        if lang in _JS_TS_LANG and _is_spurious_camelcase_flag(blob):
            logger.debug("Dropped spurious camelCase style issue")
            continue
        out.append(issue)
    return out


def _postprocess_response(result: StyleReviewResponse, *, lang: str) -> StyleReviewResponse:
    """Drop duplicate renames and obvious JS/TS false positives; refresh summary if all dropped."""
    filtered = _filter_spurious_issues(list(result.issues), lang=lang)
    summary = result.summary
    if len(result.issues) > 0 and len(filtered) == 0:
        summary = "No actionable issues after validation (redundant or invalid suggestions were removed)."
    return result.model_copy(update={"issues": filtered, "summary": summary})


def _k2_base_url() -> str:
    import re
    url = settings.k2_base_url.strip().rstrip("/")
    return re.sub(r"/chat/completions$", "", url)


async def _complete_with_k2(*, system: str, user_block: str) -> str:
    if not settings.k2_base_url.strip() or not settings.k2_api_key.strip():
        raise RuntimeError("K2 is not configured (set K2_BASE_URL and K2_API_KEY)")
    llm = ChatOpenAI(
        base_url=_k2_base_url(),
        api_key=settings.k2_api_key,
        model=settings.k2_model,
        temperature=0.2,
    )
    messages = [
        SystemMessage(content=system),
        HumanMessage(content=user_block),
    ]
    raw = await llm.ainvoke(messages)
    text = raw.content if isinstance(raw.content, str) else str(raw.content)
    return strip_thinking_tags(text)


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

    text = strip_thinking_tags(openai_message_content(resp))
    if not text.strip() and body.get("response_format"):
        logger.info("Lava light returned empty content with json_object; retrying without response_format")
        body.pop("response_format", None)
        resp = await lava_forward_chat_completions(
            upstream_chat_completions_url=upstream,
            body=body,
            use_byok=True,
        )
        text = strip_thinking_tags(openai_message_content(resp))
    return text


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
    result = await _run_model(system=SYSTEM_DIFF, user_block=user_block)
    return _postprocess_response(result, lang="")


async def run_style_review_live(*, style_guide: str, file_path: str, content: str) -> StyleReviewResponse:
    trimmed = content if len(content) <= MAX_LIVE_CHARS else content[:MAX_LIVE_CHARS]
    user_block = _build_user_block_live(style_guide, file_path, trimmed)
    lang = _language_hint(file_path)
    result = await _run_model(system=SYSTEM_LIVE, user_block=user_block)
    return _postprocess_response(result, lang=lang)
