from __future__ import annotations

import json
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.chat_service import invoke_system_user
from app.deps import get_current_user_id

router = APIRouter()

# ---------------------------------------------------------------------------
# Embedded sample project (used when the extension sends no files)
# ---------------------------------------------------------------------------
_SAMPLE_FILES = [
    {
        "path": "index.js",
        "content": """\
const express = require('express');
const app = express();
const userRoutes = require('./routes/users');
const { verifyToken } = require('./middleware/auth');

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/users', verifyToken, userRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
""",
    },
    {
        "path": "routes/users.js",
        "content": """\
const express = require('express');
const router = express.Router();
const User = require('../models/user');

router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const offset = parseInt(req.query.offset) || 0;
    const users = await User.findAll({ limit, offset });
    res.json({ users, limit, offset });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, role } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email required' });
    const user = await User.create({ name, email, role: role || 'member' });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const user = await User.update(req.params.id, req.body);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const deleted = await User.delete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'User not found' });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
""",
    },
    {
        "path": "models/user.js",
        "content": """\
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const COLLECTION = 'users';

class User {
  static async findAll({ limit = 20, offset = 0 } = {}) {
    const db = getDb();
    return db.collection(COLLECTION).find({ deletedAt: null }).skip(offset).limit(limit).toArray();
  }

  static async findById(id) {
    const db = getDb();
    return db.collection(COLLECTION).findOne({ id, deletedAt: null });
  }

  static async create({ name, email, role = 'member' }) {
    const db = getDb();
    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      createdAt: new Date().toISOString(),
      deletedAt: null,
    };
    await db.collection(COLLECTION).insertOne(user);
    return user;
  }

  static async update(id, data) {
    const db = getDb();
    const allowed = ['name', 'role'];
    const patch = { updatedAt: new Date().toISOString() };
    for (const key of allowed) {
      if (data[key] !== undefined) patch[key] = data[key];
    }
    const result = await db.collection(COLLECTION).findOneAndUpdate(
      { id, deletedAt: null },
      { $set: patch },
      { returnDocument: 'after' }
    );
    return result.value ?? null;
  }

  static async delete(id) {
    const db = getDb();
    const result = await db.collection(COLLECTION).updateOne(
      { id, deletedAt: null },
      { $set: { deletedAt: new Date().toISOString() } }
    );
    return result.modifiedCount > 0;
  }
}

module.exports = User;
""",
    },
    {
        "path": "middleware/auth.js",
        "content": """\
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ALGORITHM = 'HS256';

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, SECRET, { algorithms: [ALGORITHM] });
    req.user = payload;
    next();
  } catch (err) {
    const msg = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: msg });
  }
}

function issueToken(userId, role) {
  return jwt.sign({ sub: userId, role }, SECRET, { algorithm: ALGORITHM, expiresIn: '7d' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { verifyToken, issueToken, requireRole };
""",
    },
]

_TOUR_SYSTEM_PROMPT = """\
You are a senior software engineer giving a guided walkthrough of a codebase to a new hire.
Produce a JSON array of 5 tour step objects. Output ONLY the raw JSON array — no markdown fences, no extra text.

Each object must have EXACTLY these fields:
  "file": string — the relative file path (must exactly match one of the paths provided)
  "startLine": integer — first highlighted line (1-indexed)
  "endLine": integer — last highlighted line (1-indexed)
  "title": string — short title, max 8 words
  "explanation": string — 2-3 sentence plain-English explanation of what this code does and why it matters

Order the steps so they tell a coherent story starting from the entry point and progressing to the core logic.
Adapt the explanation to the new hire's role when provided.
"""


class TourFile(BaseModel):
    path: str = Field(max_length=500)
    content: str = Field(max_length=20_000)


class TourGenerateBody(BaseModel):
    files: list[TourFile] = Field(default_factory=list)
    user_role: str = Field(default="", max_length=300)


class TourStepOut(BaseModel):
    file: str
    startLine: int
    endLine: int
    title: str
    explanation: str


class TourGenerateResponse(BaseModel):
    steps: list[TourStepOut]


@router.post("/tour/generate", response_model=TourGenerateResponse)
async def generate_tour(
    body: TourGenerateBody,
    _user_id: str = Depends(get_current_user_id),
) -> TourGenerateResponse:
    files = body.files if body.files else [TourFile(**f) for f in _SAMPLE_FILES]

    role_line = f"New hire's role: {body.user_role}.\n\n" if body.user_role else ""
    file_blocks: list[str] = []
    for f in files:
        content = f.content
        if len(content) > 3_000:
            content = content[:3_000] + "\n// ... [truncated]"
        file_blocks.append(f"=== {f.path} ===\n{content}")

    user_msg = role_line + "Files:\n\n" + "\n\n".join(file_blocks)

    raw = await invoke_system_user(_TOUR_SYSTEM_PROMPT, user_msg)

    # Extract JSON array from response
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        raise HTTPException(status_code=500, detail=f"LLM did not return a JSON array: {raw[:300]}")

    try:
        steps_raw: list[dict] = json.loads(match.group(0))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"JSON parse error: {exc}") from exc

    steps: list[TourStepOut] = []
    for s in steps_raw:
        try:
            steps.append(TourStepOut(**s))
        except Exception:
            continue  # skip malformed steps

    if not steps:
        raise HTTPException(status_code=500, detail="LLM returned no valid tour steps.")

    return TourGenerateResponse(steps=steps)
