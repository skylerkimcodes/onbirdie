from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.bootstrap import bootstrap_default_employer
from app.db import close_db, connect_db, ensure_indexes
from app.routers import auth, chat, me


@asynccontextmanager
async def lifespan(_app: FastAPI):
    await connect_db()
    await ensure_indexes()
    await bootstrap_default_employer()
    yield
    await close_db()


app = FastAPI(title="OnBirdie API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(me.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/v1/config/public")
async def public_config() -> dict[str, str]:
    """Non-secret hints for clients (e.g. extension)."""
    return {"api_version": "1"}
