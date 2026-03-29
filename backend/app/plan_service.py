from __future__ import annotations

import json
import re
from typing import Any

from app.chat_service import invoke_system_user
from app.sample_tasks import (
    primary_onboarding_task,
    resolve_onboarding_tasks,
    tasks_from_employer_config,
)


def _fix_invalid_string_escapes(raw: str) -> str:
    """Make LLM 'JSON' parseable: only valid escapes are \\\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, \\uXXXX."""
    result: list[str] = []
    i = 0
    in_string = False
    n = len(raw)

    while i < n:
        c = raw[i]
        if not in_string:
            result.append(c)
            if c == '"':
                in_string = True
            i += 1
            continue

        if c == '"':
            k = i - 1
            bs = 0
            while k >= 0 and raw[k] == "\\":
                bs += 1
                k -= 1
            result.append(c)
            if bs % 2 == 0:
                in_string = False
            i += 1
            continue

        if c == "\\":
            if i + 1 >= n:
                result.append("\\\\")
                i += 1
                continue
            nxt = raw[i + 1]
            if nxt in '\\"/bfnrt':
                result.append(c)
                result.append(nxt)
                i += 2
                continue
            if nxt == "u" and i + 5 < n:
                hexpart = raw[i + 2 : i + 6]
                if len(hexpart) == 4 and all(
                    ch in "0123456789abcdefABCDEF" for ch in hexpart
                ):
                    result.extend(raw[i : i + 6])
                    i += 6
                    continue
            result.append("\\\\")
            result.append(nxt)
            i += 2
            continue

        result.append(c)
        i += 1

    return "".join(result)


def _parse_json_object(text: str) -> dict[str, Any]:
    t = text.strip()
    if "```" in t:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
        if m:
            t = m.group(1).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError as e:
        try:
            return json.loads(_fix_invalid_string_escapes(t))
        except json.JSONDecodeError as e2:
            raise ValueError(
                f"Planner JSON could not be parsed: {e}. After escape repair: {e2}"
            ) from e2


def _normalize_steps(raw: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for i, item in enumerate(raw):
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or f"step-{i + 1}").strip() or f"step-{i + 1}"
        title = str(item.get("title") or "").strip()
        detail = str(item.get("detail") or item.get("description") or "").strip()
        guidance = str(item.get("guidance") or "").strip()
        diff_raw = item.get("difficulty", 3)
        try:
            di = int(float(diff_raw))
        except (TypeError, ValueError):
            di = 3
        di = max(1, min(5, di))
        if not title or not detail:
            continue
        out.append(
            {
                "id": sid,
                "title": title[:300],
                "detail": detail[:2000],
                "guidance": guidance[:500],
                "difficulty": di,
                "done": False,
            }
        )
    return out


_MIN_STEPS = 3
_MAX_STEPS_EMPLOYER = 7
_MAX_STEPS_FALLBACK = 6

_BANNED_GENERIC = (
    "install development tools",
    "clone the repository",
    "run the development server",
    "explore the codebase structure",
    "read documentation and tests",
    "pick a small feature or bug",
    "implement the feature",
    "review and ship",
)


async def generate_onboarding_plan_steps(
    user: dict,
    employer: dict,
    *,
    focus_task_id: str | None,
) -> tuple[list[dict[str, Any]], str | None]:
    """Return (steps, focus_task_id stored on plan — primary task id used for the guide)."""
    role = (user.get("employee_role") or "").strip() or "engineer"
    org = (employer.get("name") or "").strip() or "the organization"
    exp = (user.get("experience_band") or "").strip() or "unspecified"

    tasks = resolve_onboarding_tasks(employer, user)
    employer_defined = tasks_from_employer_config(employer, user)
    primary = primary_onboarding_task(tasks, focus_task_id)
    resolved_focus_id = (primary.get("id") or "").strip() if primary else None

    if employer_defined and primary:
        system, user_prompt = _prompt_employer_mission(
            role=role,
            org=org,
            exp=exp,
            tasks=tasks,
            primary=primary,
        )
    elif tasks:
        system, user_prompt = _prompt_pick_small_mission(
            role=role,
            org=org,
            exp=exp,
            tasks=tasks,
            primary=primary,
        )
    else:
        system, user_prompt = _prompt_invent_micro_mission(role=role, org=org, exp=exp)

    raw_text = await invoke_system_user(system, user_prompt, temperature=0.2)
    data = _parse_json_object(raw_text)
    steps = data.get("steps")
    if not isinstance(steps, list):
        raise ValueError("LLM JSON missing 'steps' array")
    normalized = _normalize_steps(steps)
    if len(normalized) < _MIN_STEPS:
        raise ValueError("Plan must include at least 3 concrete steps")
    cap = _MAX_STEPS_EMPLOYER if employer_defined and primary else _MAX_STEPS_FALLBACK
    if len(normalized) > cap:
        normalized = normalized[:cap]
    return normalized, resolved_focus_id


def _prompt_employer_mission(
    *,
    role: str,
    org: str,
    exp: str,
    tasks: list[dict[str, Any]],
    primary: dict[str, Any],
) -> tuple[str, str]:
    tid = (primary.get("id") or "").strip()
    ptitle = (primary.get("title") or "").strip()
    pdesc = (primary.get("description") or "").strip()
    others = []
    for t in sorted(tasks, key=lambda x: int(x.get("sort_order", 0))):
        if (t.get("id") or "").strip() == tid:
            continue
        others.append(
            f"- [{(t.get('id') or '').strip()}] {(t.get('title') or '').strip()}: {(t.get('description') or '').strip()}"
        )
    other_block = "\n".join(others) if others else "(none)"

    system = (
        "You write onboarding guides for new software engineers. "
        "Output a single JSON object only — no markdown fences, no commentary. "
        'Schema: {"steps": [{"id": "kebab-case-id", "title": "string", '
        '"detail": "string", "guidance": "string", "difficulty": 1-5}]}. '
        f"Produce {_MIN_STEPS}–{_MAX_STEPS_EMPLOYER} ordered steps. "
        "The guide must help the new hire make progress on ONE employer assignment only — the PRIMARY TASK below. "
        "Each step title must sound like a concrete action (verb + object), not a generic onboarding chapter. "
        "In detail: 2–4 short sentences that a new hire can follow today — what to open, what to look for, what to try. "
        "guidance: one sentence — e.g. which search, test file, or teammate to ask if stuck. "
        "difficulty 1 = quick; 5 = hard or ambiguous. Vary across steps. "
        "FORBIDDEN as standalone step titles (or near-duplicates): generic first-week checklist items such as "
        f"{', '.join(repr(s) for s in _BANNED_GENERIC)}. "
        "Only mention environment setup or cloning if the PRIMARY TASK description explicitly requires it; "
        "if so, fold setup into at most one early step, not a laundry list. "
        "Do not invent real file paths or internal service names."
    )

    user_prompt = (
        f"Employee role: {role}\n"
        f"Employer: {org}\n"
        f"Experience band: {exp}\n\n"
        f"PRIMARY ASSIGNMENT (center the whole guide on this):\n"
        f"- id: {tid}\n"
        f"- title: {ptitle}\n"
        f"- description: {pdesc}\n\n"
        f"Other employer tasks (context only — do not build a separate plan for each):\n{other_block}\n"
    )
    return system, user_prompt


def _prompt_pick_small_mission(
    *,
    role: str,
    org: str,
    exp: str,
    tasks: list[dict[str, Any]],
    primary: dict[str, Any] | None,
) -> tuple[str, str]:
    """Sample / default task lists: pick one small mission and guide execution only."""
    task_lines = []
    for t in sorted(tasks, key=lambda x: int(x.get("sort_order", 0))):
        tid = (t.get("id") or "").strip()
        title = (t.get("title") or "").strip()
        desc = (t.get("description") or "").strip()
        task_lines.append(f"- [{tid}] {title}: {desc}")
    catalog = "\n".join(task_lines)

    chosen = ""
    if primary:
        chosen = (
            f"Start from this task as the single mission (smallest reasonable scope): "
            f'"{(primary.get("title") or "").strip()}" — {(primary.get("description") or "").strip()}'
        )

    system = (
        "You write onboarding guides for new software engineers. "
        "Output a single JSON object only — no markdown fences, no commentary. "
        'Schema: {"steps": [{"id": "kebab-case-id", "title": "string", '
        '"detail": "string", "guidance": "string", "difficulty": 1-5}]}. '
        f"Produce {_MIN_STEPS}–{_MAX_STEPS_FALLBACK} ordered steps. "
        "There is no custom employer task list in the database — the list below is suggested work by role. "
        "Choose ONE task from the list that is the smallest end-to-end slice of value (or the first if all similar). "
        "Every step must advance ONLY that one mission. "
        "Do NOT output a generic new-hire bootcamp (install tools, clone repo, run server, explore codebase, read docs, pick a feature, implement, review). "
        f"Do not use these as step titles: {', '.join(repr(s) for s in _BANNED_GENERIC)}. "
        "Titles must be specific to the chosen mission. "
        "detail: actionable for someone new; guidance: one troubleshooting sentence. "
        "Do not invent file paths."
    )

    user_prompt = (
        f"Employee role: {role}\n"
        f"Employer: {org}\n"
        f"Experience band: {exp}\n\n"
        f"Suggested tasks (pick one mission only):\n{catalog}\n\n"
        f"{chosen}\n"
    )
    return system, user_prompt


def _prompt_invent_micro_mission(*, role: str, org: str, exp: str) -> tuple[str, str]:
    system = (
        "You write onboarding guides for new software engineers. "
        "Output a single JSON object only — no markdown fences, no commentary. "
        'Schema: {"steps": [{"id": "kebab-case-id", "title": "string", '
        '"detail": "string", "guidance": "string", "difficulty": 1-5}]}. '
        f"Produce {_MIN_STEPS}–{_MAX_STEPS_FALLBACK} ordered steps. "
        "No employer task list is available. Invent ONE small, realistic practice mission for this role "
        "(e.g. trace one user flow in code, fix a trivial bug class, add a log line + verify, write one test). "
        "All steps must execute only that mission — not a generic onboarding syllabus. "
        f"Avoid banned generic titles like: {', '.join(repr(s) for s in _BANNED_GENERIC)}. "
        "Do not invent file paths."
    )
    user_prompt = (
        f"Employee role: {role}\n"
        f"Employer: {org}\n"
        f"Experience band: {exp}\n"
    )
    return system, user_prompt
