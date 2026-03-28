const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const COLLECTION = 'users';

class User {
  /**
   * Return paginated users, excluding deleted ones.
   */
  static async findAll({ limit = 20, offset = 0 } = {}) {
    const db = getDb();
    return db
      .collection(COLLECTION)
      .find({ deletedAt: null })
      .skip(offset)
      .limit(limit)
      .toArray();
  }

  static async findById(id) {
    const db = getDb();
    return db.collection(COLLECTION).findOne({ id, deletedAt: null });
  }

  static async findByEmail(email) {
    const db = getDb();
    return db
      .collection(COLLECTION)
      .findOne({ email: email.toLowerCase().trim(), deletedAt: null });
  }

  static async create({ name, email, role = 'member' }) {
    const db = getDb();
    const existing = await User.findByEmail(email);
    if (existing) {
      const err = new Error('Email already in use');
      err.code = 'DUPLICATE_EMAIL';
      throw err;
    }
    const user = {
      id: uuidv4(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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

  /** Soft-delete: set deletedAt instead of removing the document. */
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
