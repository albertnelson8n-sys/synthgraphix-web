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

  // Backfill / migrations
  await ensureColumn("users", "bonus_ksh", "bonus_ksh INTEGER NOT NULL DEFAULT 0");
  await ensureColumn("users", "full_name", "full_name TEXT");
  await ensureColumn("users", "phone", "phone TEXT");
  await ensureColumn("users", "payment_number", "payment_number TEXT");
  await ensureColumn("users", "delete_requested_at", "delete_requested_at TEXT");
  await ensureColumn("users", "delete_effective_at", "delete_effective_at TEXT");

  // TASKS POOL
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

  // DAILY ASSIGNMENTS (max 5/day enforced by server)
  await run(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      answer_text TEXT,
      completed_at TEXT,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, day_key, task_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // Optional history table (kept if you already use it elsewhere)
  await run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      reward_ksh INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    )
  `);

  // WITHDRAWALS (keep your existing)
  await run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_ksh INTEGER NOT NULL,
      phone_number TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT "Pending",
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Seed tasks if too few exist
  const row = await get("SELECT COUNT(*) AS c FROM tasks");
  const count = row ? row.c : 0;

  if (count < 500) {
    const media = [
      // Audio (Wikimedia)
      { type: "audio_transcription", url: "https://upload.wikimedia.org/wikipedia/commons/4/4f/En-us-hello.ogg", base: "Transcribe the spoken words accurately." },
      { type: "audio_transcription", url: "https://upload.wikimedia.org/wikipedia/commons/0/09/En-us-good_morning.ogg", base: "Write the exact transcript. Include punctuation." },
      { type: "audio_transcription", url: "https://upload.wikimedia.org/wikipedia/commons/2/21/En-us-thank_you.ogg", base: "Transcribe clearly. If unclear, mark [inaudible]." },

      // Video (Wikimedia)
      { type: "video_transcription", url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3f/Sample_video.ogv/Sample_video.ogv.360p.webm", base: "Transcribe any spoken words in the video. If none, describe what happens." },
      { type: "video_transcription", url: "https://upload.wikimedia.org/wikipedia/commons/transcoded/7/7e/Big_Buck_Bunny_Trailer_400p.ogv/Big_Buck_Bunny_Trailer_400p.ogv.360p.webm", base: "Write a clean transcript of the audio (or key dialogue). Short and accurate." },

      // Images (Unsplash)
      { type: "image_caption", url: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80", base: "Write one sentence describing the image (what is happening?)." },
      { type: "image_caption", url: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80", base: "Caption the image in a realistic way, like for a news post." },
      { type: "image_caption", url: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80", base: "Describe the scene and mood in 1–2 sentences." },
    ];

    function rewardFor(complexity) {
      // 10..30
      if (complexity <= 1) return 10;
      if (complexity === 2) return 15;
      if (complexity === 3) return 20;
      if (complexity === 4) return 25;
      return 30;
    }

    const titles = {
      audio_transcription: "Audio Transcription",
      video_transcription: "Video Transcription",
      image_caption: "Image Caption",
    };

    // generate up to 2000 tasks
    const target = 2000;
    const inserts = [];

    for (let i = 0; i < target; i++) {
      const m = media[i % media.length];
      const complexity = 1 + (i % 5);
      const reward_ksh = rewardFor(complexity);

      const extra =
        m.type === "image_caption"
          ? (complexity >= 4 ? " Include 2 key details you notice." : " Keep it natural and human.")
          : (complexity >= 4 ? " Include timestamps only if helpful; otherwise clean text." : " Keep it short but correct.");

      const prompt = `${m.base} ${extra}`;

      inserts.push({
        type: m.type,
        title: `${titles[m.type]} #${i + 1}`,
        prompt,
        media_url: m.url,
        reward_ksh,
        complexity,
      });
    }

    // clear old pool if it was tiny / broken (optional: keep existing)
    // We will NOT delete existing tasks. We’ll append until we reach ~2000.
    for (const t of inserts) {
      await run(
        "INSERT INTO tasks (type, title, prompt, media_url, reward_ksh, complexity, active) VALUES (?,?,?,?,?,?,1)",
        [t.type, t.title, t.prompt, t.media_url, t.reward_ksh, t.complexity]
      );
    }
  }
}

module.exports = { db, run, get, all, initDb };
