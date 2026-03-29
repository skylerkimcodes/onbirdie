"""Sample onboarding tasks employers can assign by role.

Employers may override via MongoDB on the employer document::

    role_tasks: {
        "Frontend Engineer": [
            {"id": "fe-1", "title": "...", "description": "...", "sort_order": 1},
            ...
        ]
    }

If a role has no employer-defined tasks, built-in samples are used (when available).
"""

from __future__ import annotations

from typing import Any

# Keys must match `role_options` strings (e.g. "Frontend Engineer").
SAMPLE_TASKS_BY_ROLE: dict[str, list[dict[str, Any]]] = {
    "Frontend Engineer": [
        {
            "id": "fe-local-env",
            "title": "Run the web app locally",
            "description": (
                "Install dependencies, copy `.env.example` if needed, and start the dev server. "
                "Confirm hot reload works and you can reach the main user flows in the browser."
            ),
            "sort_order": 1,
        },
        {
            "id": "fe-code-map",
            "title": "Map routing and state for one feature area",
            "description": (
                "Pick a product area (e.g. checkout or settings). Trace routes/layouts, "
                "where global state lives (Redux/Zustand/React context), and where API hooks are called."
            ),
            "sort_order": 2,
        },
        {
            "id": "fe-ui-change",
            "title": "Ship a small UI change end-to-end",
            "description": (
                "Fix a copy bug, spacing issue, or accessibility nit in a shared component. "
                "Open a PR that follows lint/format rules and includes before/after notes."
            ),
            "sort_order": 3,
        },
        {
            "id": "fe-api-trace",
            "title": "Trace one API from button click to response",
            "description": (
                "Follow a single user action through the client layer (fetch/React Query/etc.), "
                "note error and loading handling, and document the request/response shape you observed."
            ),
            "sort_order": 4,
        },
        {
            "id": "fe-design-system",
            "title": "Use the design system before writing new styles",
            "description": (
                "Locate tokens, typography, and primitives (buttons, inputs, layout). "
                "Refactor a screen to reuse existing components instead of one-off CSS where possible."
            ),
            "sort_order": 5,
        },
        {
            "id": "fe-observability",
            "title": "Find how frontend errors are surfaced",
            "description": (
                "Identify Sentry/logging, console patterns, and feature flags. "
                "Trigger a harmless error in dev and confirm it appears in the right tool."
            ),
            "sort_order": 6,
        },
    ],
}


def _normalize_task(raw: dict[str, Any], fallback_index: int) -> dict[str, Any] | None:
    title = (raw.get("title") or "").strip()
    desc = (raw.get("description") or "").strip()
    if not title or not desc:
        return None
    tid = (raw.get("id") or "").strip() or f"task-{fallback_index}"
    try:
        order = int(raw.get("sort_order", fallback_index))
    except (TypeError, ValueError):
        order = fallback_index
    return {"id": tid, "title": title, "description": desc, "sort_order": order}


def tasks_from_employer_config(employer: dict, user: dict) -> bool:
    """True when tasks come from cohort or ``role_tasks``, not built-in samples."""
    cj = (user.get("cohort_join_code") or "").strip()
    if cj:
        for c in employer.get("cohorts") or []:
            if not isinstance(c, dict):
                continue
            if (c.get("join_code") or "").strip() != cj:
                continue
            tasks = c.get("tasks")
            return isinstance(tasks, list) and len(tasks) > 0
    role = (user.get("employee_role") or "").strip()
    if not role:
        return False
    custom = employer.get("role_tasks")
    if isinstance(custom, dict) and role in custom:
        raw_list = custom.get(role)
        return isinstance(raw_list, list) and len(raw_list) > 0
    return False


def primary_onboarding_task(
    tasks: list[dict[str, Any]], focus_task_id: str | None
) -> dict[str, Any] | None:
    """Pick the task the plan should center on: explicit id, else lowest ``sort_order``."""
    if not tasks:
        return None
    if focus_task_id and focus_task_id.strip():
        fid = focus_task_id.strip()
        for t in tasks:
            if (t.get("id") or "").strip() == fid:
                return t
    ordered = sorted(tasks, key=lambda x: int(x.get("sort_order", 0)))
    return ordered[0] if ordered else None


def resolve_onboarding_tasks(employer: dict, user: dict) -> list[dict[str, Any]]:
    """Prefer cohort-specific task lists when the user registered with a cohort code."""
    role = (user.get("employee_role") or "").strip()
    cj = (user.get("cohort_join_code") or "").strip()

    if cj:
        for c in employer.get("cohorts") or []:
            if not isinstance(c, dict):
                continue
            if (c.get("join_code") or "").strip() != cj:
                continue
            tasks = c.get("tasks")
            if isinstance(tasks, list) and tasks:
                out: list[dict[str, Any]] = []
                for i, item in enumerate(tasks):
                    if not isinstance(item, dict):
                        continue
                    norm = _normalize_task(item, i + 1)
                    if norm:
                        out.append(norm)
                if out:
                    out.sort(key=lambda x: x["sort_order"])
                    return out
            break

    if not role:
        return []

    custom = employer.get("role_tasks")
    if isinstance(custom, dict) and role in custom:
        raw_list = custom.get(role)
        if isinstance(raw_list, list) and raw_list:
            out: list[dict[str, Any]] = []
            for i, item in enumerate(raw_list):
                if not isinstance(item, dict):
                    continue
                norm = _normalize_task(item, i + 1)
                if norm:
                    out.append(norm)
            if out:
                out.sort(key=lambda x: x["sort_order"])
                return out

    samples = SAMPLE_TASKS_BY_ROLE.get(role, [])
    return [dict(x) for x in samples]
