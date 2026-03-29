# OnBirdie

A multi-agent onboarding extension that autonomously guides new hires into becoming productive engineers.

## Stack

| Layer | Tech |
|--------|------|
| API & agents | FastAPI, LangGraph, LangChain (OpenAI-compatible client for **K2 Think V2**) |
| Data | MongoDB Atlas + vector search (`langchain-mongodb`, Motor/PyMongo) |
| Auth | **Auth0** for authentication; **FastAPI** with **JWT**-protected routes; users & employers in **MongoDB**; extension stores access tokens in VS Code Secret Storage |
| AI gateway / billing | **Lava** — FastAPI calls Lava REST with `httpx` and your secret key |
| Client | **VS Code extension** at repo root (Webviews / UI for onboarding) |

We use **[Auth0](https://auth0.com/)** for authentication. Configure your Auth0 tenant and application in the [Auth0 Dashboard](https://auth0.com/docs); the VS Code extension keeps access tokens in Secret Storage and sends them to the API.

Copy env templates and fill in when you have keys:

- `backend/.env.example` → `backend/.env`

**K2 Think V2:** configure `K2_BASE_URL` and `K2_API_KEY` in `backend/.env` and point LangChain/OpenAI client at that base URL (OpenAI-compatible API).

## Backend (`backend/`)

```bash
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Run the API from `backend/` (with `MONGODB_URI` and `JWT_SECRET` in `backend/.env`):

`cd backend && .venv/bin/uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`

## VS Code extension

1. Install dependencies: `npm install` (repo root)
2. Compile: `npm run compile` (or `npm run watch` while developing)
3. Open this folder in VS Code and press **F5** to launch the **Extension Development Host**
4. In the new window, open the Command Palette (**⇧⌘P** / **Ctrl+Shift+P**) and run **OnBirdie: Open welcome**

Package a `.vsix` for install elsewhere: `npm run package`

The extension talks to your FastAPI backend (e.g. `http://localhost:8000`) for agents, retrieval, and billing — there is no separate web app.
