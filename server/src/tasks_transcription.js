const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("./auth");
const dbMod = require("./db");
const run = dbMod.run;
const get = dbMod.get;
const all = dbMod.all;

const router = express.Router();

let inited = false;
let initPromise = null;

// Nairobi is UTC+3
function nairobiDayExpr() {
  return "date(datetime('now','+3 hours'))";
}

function normalize(s) {
  return String(s || "")
    .replace(/\r/g, "")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function rewardForDifficulty(d) {
  if (d >= 3) return 30;
  if (d === 2) return 20;
  return 10;
}

// Make realistic transcription scripts
function makeScript(i, difficulty) {
  // realistic Kenyan/app context + speaker labels + timestamps
  const names = ["Agent", "Customer", "Support", "System", "Moderator", "User"];
  const towns = ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Eldoret", "Thika"];
  const methods = ["M-Pesa", "Airtel Money", "Bank", "Paybill", "Till"];
  const amounts = [10, 20, 30, 50, 70, 85, 100, 120, 150, 200, 250, 300, 500, 750, 1000];
  const codes = ["RFD-1029", "WD-88421", "TXN-33019", "REF-7710", "REQ-20551"];
  const phone = `07${(10000000 + (i * 73) % 89999999).toString().padStart(8, "0")}`;
  const amt = amounts[i % amounts.length];
  const town = towns[(i * 3) % towns.length];
  const method = methods[(i * 5) % methods.length];
  const code = codes[(i * 7) % codes.length];
  const n1 = names[i % names.length];
  const n2 = names[(i + 1) % names.length];

  if (difficulty === 1) {
    return `[00:0${i % 9}] ${n1}: Please confirm withdrawal of KSH ${amt} to ${method} number ${phone}.`;
  }

  if (difficulty === 2) {
    return `[00:${(10 + (i % 40)).toString().padStart(2, "0")}] ${n1}: I submitted a withdrawal of KSH ${amt}.\n` +
           `[00:${(11 + (i % 40)).toString().padStart(2, "0")}] ${n2}: Noted. Reference code is ${code}. Processing within 1–5 hours after submission.\n` +
           `[00:${(12 + (i % 40)).toString().padStart(2, "0")}] ${n1}: I’m in ${town}. Should I retry if it fails?`;
  }

  // difficulty 3 (hard): includes punctuation, quotes, ellipses, [inaudible]
  return `[00:${(20 + (i % 30)).toString().padStart(2, "0")}] ${n1}: “Hi, I can’t access my account… it says: Invalid credentials.”\n` +
         `[00:${(21 + (i % 30)).toString().padStart(2, "0")}] ${n2}: Please reset your password, then log in again. If it persists, share your email (not your password).\n` +
         `[00:${(22 + (i % 30)).toString().padStart(2, "0")}] ${n1}: Email is user${i}@mail.com. I also referred 3 friends — when do I get the 100 bonus?\n` +
         `[00:${(23 + (i % 30)).toString().padStart(2, "0")}] ${n2}: Bonus is redeemable once you hit KSH 1,000. If unclear audio occurs, mark it as [inaudible].`;
}

async function initOnce() {
  if (inited) return;
  if (!initPromise) {
    initPromise = (async () => {
      await run(`
        CREATE TABLE IF NOT EXISTS tasks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          category TEXT NOT NULL,
          reward_ksh REAL NOT NULL,
          image TEXT DEFAULT "",
          active INTEGER DEFAULT 1
        )
      `);

      const cols = await all("PRAGMA table_info(tasks)");
      const names = new Set(cols.map(c => c.name));
      const add = async (sql) => { try { await run(sql); } catch (_) {} };

      if (!names.has("task_type")) await add("ALTER TABLE tasks ADD COLUMN task_type TEXT DEFAULT 'generic'");
      if (!names.has("source_text")) await add("ALTER TABLE tasks ADD COLUMN source_text TEXT DEFAULT ''");
      if (!names.has("answer_text")) await add("ALTER TABLE tasks ADD COLUMN answer_text TEXT DEFAULT ''");
      if (!names.has("difficulty")) await add("ALTER TABLE tasks ADD COLUMN difficulty INTEGER DEFAULT 1");

      // media support
      if (!names.has("media_kind")) await add("ALTER TABLE tasks ADD COLUMN media_kind TEXT DEFAULT 'text'"); // text|audio|video|image
      if (!names.has("media_url")) await add("ALTER TABLE tasks ADD COLUMN media_url TEXT DEFAULT ''");
      if (!names.has("media_thumb")) await add("ALTER TABLE tasks ADD COLUMN media_thumb TEXT DEFAULT ''");

      await run(`
        CREATE TABLE IF NOT EXISTS daily_task_assignments (
          user_id INTEGER NOT NULL,
          day TEXT NOT NULL,
          task_id INTEGER NOT NULL,
          PRIMARY KEY (user_id, day, task_id)
        )
      `);

      const row = await get("SELECT COUNT(*) AS c FROM tasks WHERE task_type = 'transcription'");
      const count = row?.c || 0;

      const TARGET = 3000;
      if (count < TARGET) {
        const toMake = TARGET - count;
        let startIdx = count + 1;

        // chunk inserts (still 1 by 1 but ok)
        for (let made = 0; made < toMake; made++) {
          const idx = startIdx + made;
          const difficulty = (idx % 3) + 1;
          const script = makeScript(idx, difficulty);
          const title = `Transcription #${idx}`;
          const desc =
            difficulty === 1 ? "Transcribe the short line exactly."
            : difficulty === 2 ? "Transcribe multi-line dialogue exactly (punctuation matters)."
            : "Transcribe verbatim (quotes, ellipses, numbers, [inaudible]).";

          const reward = rewardForDifficulty(difficulty);

          await run(
            `INSERT INTO tasks (title, description, category, reward_ksh, image, active, task_type, source_text, answer_text, difficulty, media_kind, media_url, media_thumb)
             VALUES (?, ?, 'Transcription', ?, '', 1, 'transcription', ?, ?, ?, 'text', '', '')`,
            [title, desc, reward, script, script, difficulty]
          );
        }
      }

      inited = true;
    })();
  }
  await initPromise;
}

async function ensureAssignments(userId) {
  await initOnce();
  const dayRow = await get(`SELECT ${nairobiDayExpr()} AS d`);
  const day = dayRow.d;

  const existing = await all(
    "SELECT task_id FROM daily_task_assignments WHERE user_id = ? AND day = ?",
    [userId, day]
  );
  if ((existing || []).length >= 5) return day;

  const need = 5 - (existing || []).length;
  const existingIds = new Set((existing || []).map(x => x.task_id));
  const existingList = Array.from(existingIds);
  const placeholders = existingList.map(() => "?").join(",");

  // Make sure we include at least 1 media task daily if any exist
  const hasMedia = await get("SELECT id FROM tasks WHERE task_type='transcription' AND active=1 AND media_kind != 'text' LIMIT 1");
  let picked = [];

  if ((existing || []).length === 0 && hasMedia) {
    const mediaPick = await all(
      `SELECT id FROM tasks
       WHERE active = 1 AND task_type = 'transcription' AND media_kind != 'text'
       ORDER BY RANDOM() LIMIT 1`
    );
    picked.push(...mediaPick);
  }

  const remainingNeed = Math.max(0, need - picked.length);

  if (remainingNeed > 0) {
    const sql = existingList.length
      ? `SELECT id FROM tasks
         WHERE active=1 AND task_type='transcription' AND id NOT IN (${placeholders})
         ORDER BY RANDOM() LIMIT ?`
      : `SELECT id FROM tasks
         WHERE active=1 AND task_type='transcription'
         ORDER BY RANDOM() LIMIT ?`;

    const more = await all(sql, existingList.length ? [...existingList, remainingNeed] : [remainingNeed]);
    picked.push(...more);
  }

  for (const p of picked) {
    await run(
      "INSERT OR IGNORE INTO daily_task_assignments (user_id, day, task_id) VALUES (?, ?, ?)",
      [userId, day, p.id]
    );
  }

  return day;
}

// New endpoints to avoid conflicts
router.get("/daily/tasks", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const day = await ensureAssignments(userId);

    const rows = await all(
      `SELECT t.id, t.title, t.description, t.category, t.reward_ksh, t.task_type,
              t.source_text, t.difficulty, t.media_kind, t.media_url, t.media_thumb
       FROM daily_task_assignments a
       JOIN tasks t ON t.id = a.task_id
       WHERE a.user_id = ? AND a.day = ?
       ORDER BY t.difficulty ASC, t.id ASC`,
      [userId, day]
    );

    const completed = await all(
      `SELECT task_id FROM task_completions
       WHERE user_id = ?
         AND date(datetime(created_at,'+3 hours')) = ?`,
      [userId, day]
    );
    const done = new Set((completed || []).map(x => x.task_id));

    const completedCount = done.size;
    const remaining = Math.max(0, 5 - completedCount);

    res.json({
      day,
      completedToday: completedCount,
      remainingToday: remaining,
      tasks: rows.map(t => ({ ...t, completed: done.has(t.id) })),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || "Failed to load tasks" });
  }
});

router.post("/daily/tasks/:id/complete", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    await initOnce();

    const taskId = Number(req.params.id);
    if (!taskId) return res.status(400).json({ error: "Invalid task id" });

    const dayRow = await get(`SELECT ${nairobiDayExpr()} AS d`);
    const day = dayRow.d;

    const c = await get(
      `SELECT COUNT(*) AS c FROM task_completions
       WHERE user_id = ? AND date(datetime(created_at,'+3 hours')) = ?`,
      [userId, day]
    );
    if ((c?.c || 0) >= 5) return res.status(400).json({ error: "Daily limit reached (5/5). Come back after midnight." });

    const assigned = await get(
      "SELECT 1 AS ok FROM daily_task_assignments WHERE user_id = ? AND day = ? AND task_id = ?",
      [userId, day, taskId]
    );
    if (!assigned) return res.status(400).json({ error: "This task is not assigned to you today." });

    const already = await get(
      `SELECT id FROM task_completions
       WHERE user_id = ? AND task_id = ?
         AND date(datetime(created_at,'+3 hours')) = ?`,
      [userId, taskId, day]
    );
    if (already) return res.status(400).json({ error: "Task already completed today." });

    const task = await get(
      "SELECT id, reward_ksh, answer_text FROM tasks WHERE id = ? AND active = 1",
      [taskId]
    );
    if (!task) return res.status(404).json({ error: "Task not found" });

    const schema = z.object({ transcription: z.string().min(1) });
    const body = schema.parse(req.body || {});
    const ok = normalize(body.transcription) === normalize(task.answer_text);
    if (!ok) return res.status(400).json({ error: "Transcription mismatch. Please try again carefully." });

    await run(
      "INSERT INTO task_completions (user_id, task_id, reward_ksh) VALUES (?, ?, ?)",
      [userId, taskId, task.reward_ksh]
    );
    await run(
      "UPDATE users SET balance_ksh = balance_ksh + ? WHERE id = ?",
      [task.reward_ksh, userId]
    );

    const me = await get("SELECT balance_ksh FROM users WHERE id = ?", [userId]);

    const c2 = await get(
      `SELECT COUNT(*) AS c FROM task_completions
       WHERE user_id = ? AND date(datetime(created_at,'+3 hours')) = ?`,
      [userId, day]
    );

    res.json({
      ok: true,
      balance_ksh: me.balance_ksh,
      completedToday: c2.c,
      remainingToday: Math.max(0, 5 - c2.c),
    });
  } catch (e) {
    res.status(400).json({ error: e.message || "Failed to complete task" });
  }
});

module.exports = router;
