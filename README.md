# OnBirdie 🐦

**OnBirdie** is a VS Code extension paired with a FastAPI backend that helps new engineers onboard faster: personalized chat, a role-aware codebase tour, guided onboarding plans, and style review against your team’s conventions. Employers configure join codes, cohorts, and style guides; employees sign in and work entirely inside the editor.

---

## What it does

- **Account and team context** — Email/password auth with JWTs stored securely in VS Code. Employers have a legacy join code plus optional **cohort codes** (e.g. frontend vs backend). An **admin portal** (separate sign-in) lets teams edit style guides, role lists, and cohort configuration.
- **Personalized assistance** — Profile includes role, resume text, LinkedIn, and skills. Chat uses that context plus employer tasks and the **effective style guide** so answers stay relevant to the person and the team.
- **Codebase tour** — AI-generated steps tailored to the user’s role, with file open and line highlighting. The tour is cached for the session so switching sidebar tabs does not repeatedly regenerate it; **New tour** forces a refresh.
- **Onboarding plan** — Breaks work into steps (“birdies”) with progress you can update from the sidebar.
- **Style review** — Review staged changes (and optional live diagnostics while editing) against the company style guide, with citations from the guide text. Optional **post-commit** review after each git commit.

---

## Architecture

| Layer | Technology |
|--------|------------|
| Extension | VS Code API, webview UI (React + TypeScript), `esbuild` bundle |
| API | FastAPI, Motor (async MongoDB), Pydantic |
| LLM calls | LangChain OpenAI-compatible client; routing prefers **K2** (if configured), else **Lava** forward proxy to an upstream (e.g. Gemini), else **OpenAI-compatible** endpoints |
| Data | MongoDB (users, employers, plans, profile fields) |

API routes are mounted under `/api/v1` (e.g. `/api/v1/auth/register`, `/api/v1/chat`, `/api/v1/me`, `/api/v1/plan`, `/api/v1/style-review`, `/api/v1/tour`, `/api/v1/employer-admin/...`). Health: `GET /health`.

---

## Prerequisites

- **Node.js** (for the extension) and **npm**
- **Python 3.12+** (for the backend virtualenv)
- **MongoDB** — A reachable URI (e.g. MongoDB Atlas). Set `MONGODB_URI` in `backend/.env`.
- At least one **LLM stack** configured in `backend/.env`: **K2** (`K2_BASE_URL` + `K2_API_KEY`), or **Lava** (`LAVA_SECRET_KEY` + upstream/model), or **OpenAI-compatible** (`OPENAI_API_KEY`).

---

## Quick start (Windows)

From the repository root:

1. **Install dependencies and create `backend/.env`** (copied from `.env.example` if missing):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap.ps1
   ```

2. **Edit `backend/.env`** — Set `MONGODB_URI`, `JWT_SECRET`, and your chosen LLM variables. See [Configuration](#configuration) below.

3. **Run the API** (keep this terminal open):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
   ```

   The API listens at **http://127.0.0.1:8000**.

4. **Run the extension** — In VS Code, open this folder, run `npm run compile`, then **F5** (“OnBirdie: Run Extension”). In the Extension Development Host, open the OnBirdie sidebar and sign in.

`bootstrap.ps1` does **not** start the API; **F5** only launches the extension. You need **both** the API process and the extension for full functionality.

### macOS / Linux

Equivalent steps:

```bash
npm install
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cp backend/.env.example backend/.env   # then edit
cd backend && .venv/bin/uvicorn app.main:app --reload --reload-dir app --host 127.0.0.1 --port 8000
```

From the repo root, `npm run compile`, then F5 in VS Code.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | Required. Connection string including database if needed. |
| `MONGODB_DB_NAME` | Database name (default `onbirdie`). |
| `JWT_SECRET` | Required for signing user and admin tokens (use a long random value in production). |
| `K2_BASE_URL`, `K2_API_KEY`, `K2_MODEL` | Preferred route for chat, plan JSON, and tour when set. |
| `LAVA_SECRET_KEY`, `LAVA_FORWARD_UPSTREAM`, `LAVA_CHAT_MODEL` | Alternative: chat via [Lava](https://lava.so/docs) as a gateway to an OpenAI-compatible upstream. |
| `OPENAI_API_KEY`, `OPENAI_BASE_URL` | Fallback OpenAI-compatible API. |
| `STYLE_REVIEW_TIER` | `lava_light` (default) or `k2` for style-review model routing. |
| `STYLE_GUIDE_USE_MICROSOFT_DEMO` | When `true`, uses a bundled demo guide if no employer guide is set. |
| `DEFAULT_EMPLOYER_ADMIN_CODE` | Plain password used to hash the default employer’s admin portal credential on first API boot (change in production). |

Copy from `backend/.env.example` and adjust. Never commit real secrets.

### Extension (VS Code settings)

- **`onbirdie.apiBaseUrl`** — Base URL of the API (default `http://127.0.0.1:8000`, no trailing slash).
- **`onbirdie.styleReviewOnCommit`** — Run style review after each commit (default on).
- **`onbirdie.liveStyleCheck`** — Live style diagnostics while editing (default on).

---

## Development

| Command | Description |
|---------|-------------|
| `npm run compile` | TypeScript compile for extension + webview bundle |
| `npm run watch` | Watch mode for extension + webview during development |
| `npm run package` | Build a `.vsix` for distribution (`vsce`) |

Python: `ruff` is listed in `requirements.txt` for linting; `pyrightconfig.json` and `.vscode/settings.json` help the IDE resolve the backend package.

---

## Repository layout

```
├── backend/app/          # FastAPI app (routers, services, schemas)
├── sample-project/       # Fallback sample repo when no workspace is open
├── scripts/              # bootstrap.ps1, dev.ps1
├── src/                  # Extension source (extension.ts, panels, webview)
├── out/                  # Compiled extension output (generated)
└── package.json          # Extension manifest and npm scripts
```

---

## Default demo data

On API startup, bootstrap ensures a default employer with join code **`onbirdie`** (dev only unless you change it). Cohort codes such as **`ONBD-FE`** / **`ONBD-BE`** may be seeded when missing. Use **Admin sign in** in the login view with your company identifier and the admin code from `DEFAULT_EMPLOYER_ADMIN_CODE` (see `.env.example`) to edit team settings.

---

## Troubleshooting

- **“Could not connect to http://127.0.0.1:8000”** — Start the API with `scripts/dev.ps1` (or uvicorn manually) and keep that process running. Confirm `onbirdie.apiBaseUrl` matches your server.
- **MongoDB errors on startup** — Check `MONGODB_URI` and network access to the cluster.
- **Chat or tour errors** — Verify at least one of K2, Lava, or OpenAI is configured and model IDs match your provider.

---

## Contributing

Use focused commits and match existing patterns in both TypeScript and Python. Run `npm run compile` before submitting extension changes.

---

*OnBirdie — onboarding that meets engineers inside VS Code.*
