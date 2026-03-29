from __future__ import annotations

import json
import re
from typing import Any

from app.chat_service import invoke_system_user
from app.sample_tasks import resolve_onboarding_tasks


def _parse_json_object(text: str) -> dict[str, Any]:
    t = text.strip()
    if "```" in t:
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", t)
        if m:
            t = m.group(1).strip()
    return json.loads(t)


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


async def generate_onboarding_plan_steps(
    user: dict,
    employer: dict,
    *,
    focus_task_id: str | None,
) -> list[dict[str, Any]]:
    role = (user.get("employee_role") or "").strip() or "engineer"
    org = (employer.get("name") or "").strip() or "the organization"
    exp = (user.get("experience_band") or "").strip() or "unspecified"

    tasks = resolve_onboarding_tasks(employer, user.get("employee_role"))
    task_lines = []
    focus_title = ""
    for t in sorted(tasks, key=lambda x: int(x.get("sort_order", 0))):
        tid = (t.get("id") or "").strip()
        title = (t.get("title") or "").strip()
        desc = (t.get("description") or "").strip()
        if focus_task_id and tid == focus_task_id.strip():
            focus_title = title
        task_lines.append(f"- [{tid}] {title}: {desc}")

    tasks_block = "\n".join(task_lines) if task_lines else "(No employer tasks — infer sensible frontend onboarding steps.)"

    focus_note = ""
    if focus_task_id and focus_task_id.strip():
        focus_note = (
            f'Prioritize steps that help complete employer task id "{focus_task_id.strip()}"'
            f' ("{focus_title}"). Still include 1–2 steps for environment setup if needed.'
        )
    else:
        focus_note = (
            "Produce a balanced first-week plan covering setup, codebase orientation, "
            "and one small shipped contribution."
        )

    system = (
        "You are an onboarding planner for software teams. "
        "Output a single JSON object only — no markdown fences, no commentary. "
        'Schema: {"steps": [{"id": "kebab-case-id", "title": "string", '
        '"detail": "string", "guidance": "string", "difficulty": 3}]}. '
        "Produce 6–10 ordered steps. Each step must be actionable in 1–3 sentences in detail. "
        "guidance is one short sentence: how to approach it when the codebase is unfamiliar "
        "(e.g. search, ask, read tests). "
        "difficulty is an integer 1–5: 1 = quick win / low complexity, 5 = substantial effort, "
        "scope, or ambiguity. Vary difficulty across steps; not all 3. "
        "Do not invent specific file paths or repo names."
    )

    user_prompt = (
        f"Employee role: {role}\n"
        f"Employer: {org}\n"
        f"Experience band: {exp}\n\n"
        f"Employer onboarding tasks:\n{tasks_block}\n\n"
        f"Planning instruction: {focus_note}"
    )

    raw_text = await invoke_system_user(system, user_prompt, temperature=0.2)
    data = _parse_json_object(raw_text)
    steps = data.get("steps")
    if not isinstance(steps, list):
        raise ValueError("LLM JSON missing 'steps' array")
    normalized = _normalize_steps(steps)
    if len(normalized) < 3:
        raise ValueError("Plan must include at least 3 concrete steps")
    return normalized
