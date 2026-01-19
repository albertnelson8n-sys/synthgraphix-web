const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const DB_PATH =
  process.env.DB_PATH ||
  path.join(__dirname, "..", "data.sqlite");

const db = new sqlite3.Database(DB_PATH);

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

async function initDb() {
  await run("PRAGMA foreign_keys = ON");
  await run("PRAGMA journal_mode = WAL");

  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,

      referral_code TEXT UNIQUE,
      referred_by INTEGER,

      balance_ksh INTEGER NOT NULL DEFAULT 0,
      bonus_ksh   INTEGER NOT NULL DEFAULT 0,

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

      -- canonical task type/category
      type TEXT NOT NULL,
      category TEXT NOT NULL,

      title TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,

      -- media URL + legacy alias "image"
      media_url TEXT,
      image TEXT,

      reward_ksh INTEGER NOT NULL,
      complexity INTEGER NOT NULL,

      active INTEGER NOT NULL DEFAULT 1
    );
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      reward_ksh INTEGER NOT NULL,
      answer_text TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
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
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_ksh INTEGER NOT NULL,
      phone_number TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT "pending",
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // seed tasks if empty
  const c = await get("SELECT COUNT(*) AS n FROM tasks");
  if ((c?.n || 0) > 0) return;

  const MEDIA = {
    audio: [
      "https://upload.wikimedia.org/wikipedia/commons/4/4f/En-us-hello.ogg",
      "https://upload.wikimedia.org/wikipedia/commons/7/7e/En-us-thank_you.ogg",
      "https://upload.wikimedia.org/wikipedia/commons/9/9e/En-us-yes.ogg",
      "https://upload.wikimedia.org/wikipedia/commons/1/12/En-us-no.ogg"
    ],
    video: [
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/8/86/Big_Buck_Bunny_Trailer_400p.ogv/Big_Buck_Bunny_Trailer_400p.ogv.480p.vp9.webm",
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/6/63/Wikipedia_Edit_2014.webm/Wikipedia_Edit_2014.webm.480p.vp9.webm",
      "https://upload.wikimedia.org/wikipedia/commons/transcoded/3/3d/Walking_in_Tokyo.webm/Walking_in_Tokyo.webm.480p.vp9.webm"
    ],
    image: [
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Cat03.jpg/640px-Cat03.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Golden_Retriever_medium-to-light-coat.jpg/640px-Golden_Retriever_medium-to-light-coat.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/New_york_times_square-terabass.jpg/640px-New_york_times_square-terabass.jpg",
      "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Example.svg/640px-Example.svg.png"
    ]
  };

  const TYPES = [
    { type: "audio_transcription", media: "audio", base: 10, max: 18 },
    { type: "video_transcription", media: "video", base: 18, max: 30 },
    { type: "image_caption", media: "image", base: 12, max: 22 },
    { type: "image_tagging", media: "image", base: 10, max: 18 },
    { type: "text_cleanup", media: null, base: 10, max: 16 }
  ];

  function rewardFor(t) {
    const r = t.base + Math.floor(Math.random() * (t.max - t.base + 1));
    return Math.max(10, Math.min(30, r));
  }

  const TOTAL = 2500; // thousands
  await run("BEGIN");
  try {
    for (let i = 1; i <= TOTAL; i++) {
      const t = TYPES[i % TYPES.length];
      const complexity = t.type === "video_transcription" ? 3 : t.type === "image_caption" ? 2 : 1;
      const reward_ksh = rewardFor(t);

      let media_url = null;
      if (t.media === "audio") media_url = MEDIA.audio[i % MEDIA.audio.length];
      if (t.media === "video") media_url = MEDIA.video[i % MEDIA.video.length];
      if (t.media === "image") media_url = MEDIA.image[i % MEDIA.image.length];

      const titleBase =
        t.type === "audio_transcription" ? "Audio Transcription" :
        t.type === "video_transcription" ? "Video Transcription" :
        t.type === "image_caption" ? "Image Caption" :
        t.type === "image_tagging" ? "Image Tagging" :
        "Text Cleanup";

      const prompt =
        t.type === "audio_transcription" ? "Listen and transcribe exactly what is spoken. Use punctuation. If unclear, write [inaudible]." :
        t.type === "video_transcription" ? "Watch the clip and transcribe any spoken words. If no speech, describe visible on-screen text briefly." :
        t.type === "image_caption" ? "Write a clear 1–2 sentence caption describing what is visible (subjects + setting)." :
        t.type === "image_tagging" ? "Provide 5–10 comma-separated tags describing objects, place, and action." :
        "Rewrite the text to be clear and correct (fix grammar/spelling) without changing meaning.";

      const description = prompt;

      await run(
        `INSERT INTO tasks (type, category, title, description, prompt, media_url, image, reward_ksh, complexity, active)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        [
          t.type,
          t.type,
          `${titleBase} #${i}`,
          description,
          prompt,
          media_url,
          media_url,
          reward_ksh,
          complexity
        ]
      );
    }
    await run("COMMIT");
  } catch (e) {
    await run("ROLLBACK");
    throw e;
  }
}

module.exports = { db, run, get, all, initDb };
