from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

_client: AsyncIOMotorClient | None = None
_db: AsyncIOMotorDatabase | None = None


def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialized")
    return _db


async def connect_db() -> None:
    global _client, _db
    if not settings.mongodb_uri.strip():
        raise RuntimeError("MONGODB_URI is not set in environment")
    _client = AsyncIOMotorClient(settings.mongodb_uri)
    _db = _client[settings.mongodb_db_name]


async def close_db() -> None:
    global _client, _db
    if _client:
        _client.close()
    _client = None
    _db = None


async def ensure_indexes() -> None:
    db = get_db()
    await db.employers.create_index("join_code", unique=True)
    await db.users.create_index("email", unique=True)
