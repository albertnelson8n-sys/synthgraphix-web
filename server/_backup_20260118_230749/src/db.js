const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, "..", "data.sqlite");
const db = new sqlite3.Database(DB_PATH);

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

async function initDb() {
  // Users
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,

      referral_code TEXT UNIQUE,
      referred_by INTEGER,

      balance_ksh INTEGER NOT NULL DEFAULT 0,
      bonus_ksh INTEGER NOT NULL DEFAULT 0,

      full_name TEXT,
      phone TEXT,
      payment_number TEXT,

      created_at TEXT NOT NULL DEFAULT (datetime("now")),
      delete_requested_at TEXT,
      delete_effective_at TEXT,

      FOREIGN KEY (referred_by) REFERENCES users(id)
    );
  `);

  // Tasks
  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      reward_ksh INTEGER NOT NULL,
      image TEXT,
      active INTEGER NOT NULL DEFAULT 1,

      task_type TEXT NOT NULL DEFAULT "transcription",
      media_url TEXT,
      reference_text TEXT
    );
  `);

  // Daily assignment: 5 per user per day
  await run(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      UNIQUE(user_id, day, task_id),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(task_id) REFERENCES tasks(id)
    );
  `);

  // Completions (includes answer_text)
  await run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      reward_ksh INTEGER NOT NULL,
      answer_text TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime("now")),
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(task_id) REFERENCES tasks(id),
      UNIQUE(user_id, task_id, created_at)
    );
  `);

  // Withdrawals
  await run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_ksh INTEGER NOT NULL,
      phone_number TEXT,
      method TEXT,
      status TEXT NOT NULL DEFAULT "pending",
      created_at TEXT NOT NULL DEFAULT (datetime("now")),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
  `);

  // Referral reward tracking: only once per referred user (after verification)
  await run(`
    CREATE TABLE IF NOT EXISTS referral_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime("now")),
      UNIQUE(referrer_id, referred_user_id),
      FOREIGN KEY(referrer_id) REFERENCES users(id),
      FOREIGN KEY(referred_user_id) REFERENCES users(id)
    );
  `);
}

module.exports = { db, run, get, all, initDb };
