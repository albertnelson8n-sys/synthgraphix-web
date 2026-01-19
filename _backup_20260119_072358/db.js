const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "..", "data.sqlite");
const db = new sqlite3.Database(DB_FILE);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
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

async function seedTasksIfNeeded() {
  const row = await get("SELECT COUNT(*) AS c FROM tasks");
  const count = row?.c || 0;
  if (count >= 600) return;

  const audioUrls = [
    "https://upload.wikimedia.org/wikipedia/commons/4/4f/En-us-hello.ogg",
    "https://upload.wikimedia.org/wikipedia/commons/8/8e/En-us-good-morning.ogg",
    "https://upload.wikimedia.org/wikipedia/commons/0/0b/En-us-thank-you.ogg"
  ];
  const videoUrls = [
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/bee.mp4"
  ];
  const imageUrls = [
    "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Example.jpg/640px-Example.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Fronalpstock_big.jpg/640px-Fronalpstock_big.jpg",
    "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Gull_portrait_ca_usa.jpg/640px-Gull_portrait_ca_usa.jpg"
  ];

  function rewardFor(complexity) {
    if (complexity >= 3) return 30;
    if (complexity === 2) return 20;
    return 10;
  }

  const inserts = [];
  const mk = (type, category, i, media_url, complexity, prompt) => {
    const reward_ksh = rewardFor(complexity);
    const title =
      type === "audio_transcription" ? `Audio Transcription #${i}` :
      type === "video_transcription" ? `Video Transcription #${i}` :
      `Image Caption #${i}`;

    const description =
      type === "image_caption"
        ? "Write a clear 1–2 sentence caption describing what is visible."
        : "Transcribe the content accurately. Keep it short but correct.";

    inserts.push([
      type,
      category,
      title,
      description,
      prompt,
      media_url,
      reward_ksh,
      complexity
    ]);
  };

  for (let i = 1; i <= 300; i++) {
    const c = (i % 3) + 1;
    mk(
      "audio_transcription",
      "transcription",
      i,
      audioUrls[i % audioUrls.length],
      c,
      "Listen to the audio clip and transcribe exactly what is spoken. Use proper punctuation. If unclear, write [inaudible]."
    );
  }
  for (let i = 1; i <= 220; i++) {
    const c = ((i + 1) % 3) + 1;
    mk(
      "video_transcription",
      "transcription",
      i,
      videoUrls[i % videoUrls.length],
      c,
      "Watch the video and transcribe any spoken words or visible key on-screen text. If there is no speech, describe what happens briefly."
    );
  }
  for (let i = 1; i <= 220; i++) {
    const c = ((i + 2) % 3) + 1;
    mk(
      "image_caption",
      "captioning",
      i,
      imageUrls[i % imageUrls.length],
      c,
      "Write a short caption describing the main subjects and setting in the image."
    );
  }

  await run("BEGIN");
  try {
    for (const p of inserts) {
      await run(
        `INSERT INTO tasks
          (type, category, title, description, prompt, media_url, reward_ksh, complexity, active, created_at)
         VALUES (?,?,?,?,?,?,?,?,1,CURRENT_TIMESTAMP)`,
        p
      );
    }
    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }
}

async function initDb() {
  await run("PRAGMA foreign_keys = ON");

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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      delete_requested_at TEXT,
      delete_effective_at TEXT,
      FOREIGN KEY (referred_by) REFERENCES users(id)
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      media_url TEXT,
      reward_ksh INTEGER NOT NULL,
      complexity INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS daily_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      task_id INTEGER NOT NULL,
      assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      answer_text TEXT,
      UNIQUE(user_id, day_key, task_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      reward_ksh INTEGER NOT NULL,
      answer_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_ksh INTEGER NOT NULL,
      phone_number TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS task_completions_legacy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      reward_ksh INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `).catch(() => {});

  await seedTasksIfNeeded();
}

module.exports = { db, run, get, all, initDb };
