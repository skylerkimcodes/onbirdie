from __future__ import annotations

import urllib.parse

import httpx
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from app.config import settings
from app.schemas import ChatTurn

_RESUME_CAP = 12_000


def llm_client_openai_compatible() -> ChatOpenAI | None:
    key = (settings.k2_api_key or settings.openai_api_key or "").strip()
    if not key:
        return None
    base = (settings.k2_base_url or settings.openai_base_url or "").strip().rstrip("/")
    kwargs: dict = {
        "model": settings.chat_model.strip() or "gpt-4o-mini",
        "temperature": 0.35,
        "api_key": key,
    }
    if base:
        kwargs["base_url"] = base
    return ChatOpenAI(**kwargs)


def _openai_style_messages(system_prompt: str, turns: list[ChatTurn]) -> list[dict[str, str]]:
    out: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]
    for t in turns:
        out.append({"role": t.role, "content": t.content})
    return out


async def _chat_via_lava(messages: list[dict[str, str]]) -> str:
    key = (settings.lava_secret_key or "").strip()
    if not key:
        raise RuntimeError("LAVA_SECRET_KEY is empty.")

    base = (settings.lava_api_base_url or "https://api.lava.so/v1").strip().rstrip("/")
    upstream = (settings.lava_forward_upstream or "").strip()
    if not upstream:
        upstream = "https://api.openai.com/v1/chat/completions"

    forward_url = f"{base}/forward?u={urllib.parse.quote(upstream, safe='')}"
    payload = {
        "model": settings.chat_model.strip() or "gpt-4o-mini",
        "messages": messages,
        "temperature": 0.35,
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        response = await client.post(
            forward_url,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as e:
        detail = response.text[:500]
        raise RuntimeError(f"Lava request failed ({e.response.status_code}): {detail}") from e

    data = response.json()
    if isinstance(data, dict) and "data" in data and "choices" not in data:
        inner = data.get("data")
        if isinstance(inner, dict):
            data = inner

    choices = data.get("choices") if isinstance(data, dict) else None
    if not choices:
        raise RuntimeError(f"Unexpected Lava response shape: {str(data)[:400]}")

    msg = choices[0].get("message") or {}
    content = msg.get("content") if isinstance(msg, dict) else None
    if not isinstance(content, str):
        content = str(content) if content is not None else ""
    return content.strip() or "I did not get a response. Please try again."


def build_system_prompt(user: dict, employer: dict) -> str:
    lines = [
        "You are OnBirdie, a concise onboarding assistant for software engineers working inside VS Code.",
        "Use short Markdown when it helps: bullets, **bold** for emphasis, no walls of text.",
        "You explain the codebase onboarding process, break down first tasks, and answer questions.",
        "When the user asks about their resume, LinkedIn, skills, or background, use the employee context below.",
        "If you lack information, say so and suggest what they could add to their profile.",
        "",
        "Employee context:",
    ]
    email = user.get("email") or ""
    name = (user.get("display_name") or "").strip() or (email.split("@")[0] if email else "there")
    role = (user.get("employee_role") or "").strip() or "engineer"
    exp = (user.get("experience_band") or "").strip()
    org = (employer.get("name") or "").strip()
    lines.append(f"- Name: {name}")
    lines.append(f"- Role: {role}")
    if exp:
        lines.append(f"- Experience band: {exp}")
    if org:
        lines.append(f"- Organization: {org}")
    li = (user.get("linkedin_url") or "").strip()
    if li:
        lines.append(f"- LinkedIn: {li}")
    skills = (user.get("skills_summary") or "").strip()
    if skills:
        cap = min(2000, len(skills))
        lines.append(f"- Skills / highlights: {skills[:cap]}{'…' if len(skills) > cap else ''}")

    resume = (user.get("resume_text") or "").strip()
    lines.append("")
    if resume:
        excerpt = resume if len(resume) <= _RESUME_CAP else resume[:_RESUME_CAP] + "\n… [truncated]"
        lines.append("Resume text on file (may be truncated):")
        lines.append(excerpt)
    else:
        lines.append("No resume text on file (user may have only provided LinkedIn).")

    return "\n".join(lines)


async def run_chat(system_prompt: str, turns: list[ChatTurn]) -> str:
    oa_messages = _openai_style_messages(system_prompt, turns)

    if (settings.lava_secret_key or "").strip():
        return await _chat_via_lava(oa_messages)

    llm = llm_client_openai_compatible()
    if llm is None:
        raise RuntimeError(
            "LLM is not configured. Set LAVA_SECRET_KEY (recommended), or K2_API_KEY / OPENAI_API_KEY "
            "in backend/.env."
        )

    lc_messages: list[SystemMessage | HumanMessage | AIMessage] = [
        SystemMessage(content=system_prompt)
    ]
    for t in turns:
        if t.role == "user":
            lc_messages.append(HumanMessage(content=t.content))
        else:
            lc_messages.append(AIMessage(content=t.content))

    result = await llm.ainvoke(lc_messages)
    text = result.content
    if not isinstance(text, str):
        text = str(text) if text is not None else ""
    return text.strip() or "I did not get a response. Please try again."
