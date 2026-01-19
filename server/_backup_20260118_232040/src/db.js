const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "..", "data.sqlite");
const db = new sqlite3.Database(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function hasColumn(table, col) {
  const rows = await all(`PRAGMA table_info(${table})`);
  return rows.some((r) => r.name === col);
}

async function ensureColumn(table, col, ddl) {
  const ok = await hasColumn(table, col);
  if (!ok) {
    await run(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

  // USERS
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,

      referral_code TEXT UNIQUE NOT NULL,
      referred_by INTEGER,

      balance_ksh INTEGER NOT NULL DEFAULT 0,
      bonus_ksh INTEGER NOT NULL DEFAULT 0,

      full_name TEXT,
      phone TEXT,
      payment_number TEXT,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      delete_requested_at TEXT,
      delete_effective_at TEXT,

      FOREIGN KEY (referred_by) REFERENCES users(id)
    )
  `);

  await ensureColumn("users", "bonus_ksh", "bonus_ksh INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "full_name", "full_name TEXT");
  await ensureColumn("users", "phone", "phone TEXT");
  await ensureColumn("users", "payment_number", "payment_number TEXT");
  await ensureColumn("users", "delete_requested_at", "delete_requested_at TEXT");
  await ensureColumn("users", "delete_effective_at", "delete_effective_at TEXT");

  // TASKS
  // NOTE: you may already have an older tasks table with columns like:
  // title, description, category, reward_ksh, image, active
  // We keep it and add the missing new columns.
  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      media_url TEXT NOT NULL,
      reward_ksh INTEGER NOT NULL,
      complexity INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1
    )
  `);

  // Migrate old schema -> new columns (non-destructive)
  await ensureColumn("tasks", "type", "type TEXT");
  await ensureColumn("tasks", "prompt", "prompt TEXT");
  await ensureColumn("tasks", "media_url", "media_url TEXT");
  await ensureColumn("tasks", "complexity", "complexity INTEGER NOT NULL DEFAULT 1");

  // Backfill from old columns if they exist
  const hasDescription = await hasColumn("tasks", "description");
  const hasCategory = await hasColumn("tasks", "category");
  const hasImage = await hasColumn("tasks", "image");

  // prompt: prefer prompt, else description, else default
  if (hasDescription) {
    await run(`
      UPDATE tasks
      SET prompt = COALESCE(NULLIF(prompt,), description, Complete
