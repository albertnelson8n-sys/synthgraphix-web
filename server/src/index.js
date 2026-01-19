require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const { initDb, run, get, all } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5175;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function dayKeyNairobi() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function requireAuth(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer (.+)$/);
    if (!m) return res.status(401).json({ error: "Unauthorized" });
    const token = m[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function makeReferralCode(username) {
  const base = username.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "USER";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return base + rand;
}

app.get("/api/health", (req, res) => res.json({ ok: true }));

const RegisterSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  referralCode: z.string().optional().default(""),
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const data = RegisterSchema.parse(req.body);

    const existsEmail = await get("SELECT id FROM users WHERE email = ?", [data.email]);
    if (existsEmail) return res.status(400).json({ error: "Email already registered" });

    const existsUser = await get("SELECT id FROM users WHERE username = ?", [data.username]);
    if (existsUser) return res.status(400).json({ error: "Username already taken" });

    let referredById = null;
    if (data.referralCode && data.referralCode.trim()) {
      const ref = await get("SELECT id FROM users WHERE referral_code = ?", [data.referralCode.trim()]);
      if (!ref) return res.status(400).json({ error: "Invalid referral code" });
      referredById = ref.id;
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    // ensure unique referral code
    let referral_code = makeReferralCode(data.username);
    for (let i = 0; i < 10; i++) {
      const existsCode = await get("SELECT id FROM users WHERE referral_code = ?", [referral_code]);
      if (!existsCode) break;
      referral_code = makeReferralCode(data.username);
    }

    const userInsert = await run(
      "INSERT INTO users (username, email, password_hash, referral_code, referred_by, balance_ksh, bonus_ksh) VALUES (?, ?, ?, ?, ?, 0, 0)",
      [data.username, data.email, password_hash, referral_code, referredById]
    );

    // referral bonus goes into bonus wallet
    if (referredById) {
      await run("UPDATE users SET bonus_ksh = bonus_ksh + 100 WHERE id = ?", [referredById]);
    }

    const token = jwt.sign({ id: userInsert.lastID }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const data = LoginSchema.parse(req.body);
    const user = await get("SELECT id, password_hash FROM users WHERE email = ?", [data.email]);
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});


app.get("/api/me", requireAuth, async (req, res) => {
  try {
    const u = await get(
      "SELECT id, username, email, " +
        "COALESCE(full_name, '') AS full_name, " +
        "COALESCE(phone, '') AS phone, " +
        "COALESCE(payment_number, '') AS payment_number, " +
        "referral_code, balance_ksh, COALESCE(bonus_ksh,0) AS bonus_ksh, " +
        "created_at, delete_requested_at, delete_effective_at " +
      "FROM users WHERE id = ?",
      [req.user.id]
    );
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u);
  } catch (e) {
    console.error("/api/me failed:", e);
    res.status(500).json({ error: "Server error" });
  }
});




app.put("/api/me", requireAuth, async (req, res) => {
  try {
    const full_name = (req.body.full_name || "").toString();
    const phone = (req.body.phone || "").toString();
    const payment_number = (req.body.payment_number || "").toString();

    await run(
      "UPDATE users SET full_name=?, phone=?, payment_number=? WHERE id=?",
      [full_name, phone, payment_number, req.user.id]
    );
    const me = await get(
      "SELECT id, username, email, referral_code, balance_ksh, bonus_ksh, COALESCE(full_name,'') AS full_name, COALESCE(phone,'') AS phone, COALESCE(payment_number,'') AS payment_number FROM users WHERE id=?",
      [req.user.id]
    );
    res.json(me);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/me/password", requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6),
  });
  try {
    const data = schema.parse(req.body);
    const user = await get("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    const ok = user && (await bcrypt.compare(data.currentPassword, user.password_hash));
    if (!ok) return res.status(400).json({ error: "Current password is wrong" });

    const newHash = await bcrypt.hash(data.newPassword, 10);
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.delete("/api/me", requireAuth, async (req, res) => {
  await run("DELETE FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true });
});

app.get("/api/referrals/status", requireAuth, async (req, res) => {
  const r = await get("SELECT COUNT(*) AS referrals FROM users WHERE referred_by = ?", [req.user.id]);
  const u = await get("SELECT bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ referrals: r?.referrals || 0, bonus_ksh: u?.bonus_ksh || 0 });
});

app.post("/api/referrals/redeem", requireAuth, async (req, res) => {
  const u = await get("SELECT bonus_ksh, balance_ksh FROM users WHERE id = ?", [req.user.id]);
  if (!u) return res.status(404).json({ error: "User not found" });
  if ((u.bonus_ksh || 0) < 1000) return res.status(400).json({ error: "Bonus must reach KSH 1000 to redeem" });

  await run("UPDATE users SET balance_ksh = balance_ksh + 1000, bonus_ksh = bonus_ksh - 1000 WHERE id = ?", [req.user.id]);
  const me = await get("SELECT balance_ksh, bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true, ...me });
});

// ---- Daily task assignment (max 5/day; avoid duplicate types) ----
async function ensureDailyTasks(userId, dayKey) {
  await run("PRAGMA foreign_keys = ON");

  // clean broken rows (prevents crashes)
  await run("DELETE FROM daily_tasks WHERE user_id NOT IN (SELECT id FROM users)");
  await run("DELETE FROM daily_tasks WHERE task_id NOT IN (SELECT id FROM tasks)");

  const user = await get("SELECT id FROM users WHERE id = ?", [userId]);
  if (!user) return;

  // already have tasks for today?
  const existing = await all("SELECT task_id FROM daily_tasks WHERE user_id=? AND day_key=?", [userId, dayKey]);
  if (existing.length >= 5) return;

  // ensure we do not duplicate type per day
  const existingTypes = await all(
    `SELECT DISTINCT t.type AS type
     FROM daily_tasks dt
     JOIN tasks t ON t.id = dt.task_id
     WHERE dt.user_id=? AND dt.day_key=?`,
    [userId, dayKey]
  );
  const used = new Set(existingTypes.map(x => x.type));

  const ALL_TYPES = ["audio_transcription", "video_transcription", "image_caption", "image_tagging", "text_cleanup"];
  const picks = [];

  for (const typ of ALL_TYPES) {
    if (used.has(typ)) continue;
    const row = await get(
      "SELECT id FROM tasks WHERE active=1 AND type=? ORDER BY RANDOM() LIMIT 1",
      [typ]
    );
    if (row) picks.push(row.id);
    if (picks.length + existing.length >= 5) break;
  }

  // fill remainder with random tasks not already chosen (still avoid duplicate type)
  while (picks.length + existing.length < 5) {
    const row = await get(
      `SELECT id, type FROM tasks WHERE active=1 ORDER BY RANDOM() LIMIT 1`
    );
    if (!row) break;
    if (used.has(row.type)) continue;
    used.add(row.type);
    picks.push(row.id);
  }

  for (const tid of picks) {
    await run(
      "INSERT OR IGNORE INTO daily_tasks (user_id, day_key, task_id) VALUES (?,?,?)",
      [userId, dayKey, tid]
    );
  }
}

app.get("/api/tasks", requireAuth, async (req, res) => {
  try {
    const dayKey = dayKeyNairobi();
    await ensureDailyTasks(req.user.id, dayKey);

    const rows = await all(
      `SELECT
         dt.id AS dt_id,
         t.id AS id,
         t.type,
         t.category,
         t.title,
         t.prompt,
         t.media_url,
         t.reward_ksh,
         t.complexity,
         CASE WHEN dt.completed_at IS NULL THEN 0 ELSE 1 END AS completed,
         dt.answer_text
       FROM daily_tasks dt
       JOIN tasks t ON t.id = dt.task_id
       WHERE dt.user_id = ? AND dt.day_key = ?
       ORDER BY dt.id ASC
       LIMIT 5`,
      [req.user.id, dayKey]
    );

    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    const remaining = rows.filter(r => !r.completed).length;

    res.json({ day_key: dayKey, remaining, balance_ksh: me?.balance_ksh || 0, tasks: rows });
  } catch (e) {
    res.status(500).json({ error: e.message || "Failed to load tasks" });
  }
});

app.post("/api/tasks/:id/complete", requireAuth, async (req, res) => {
  try {
    const dayKey = dayKeyNairobi();
    const taskId = Number(req.params.id);
    if (!Number.isFinite(taskId)) return res.status(400).json({ error: "Invalid task id" });

    const ans = (req.body.answer_text ?? req.body.answer ?? "").toString().trim();
    if (ans.length < 2) return res.status(400).json({ error: "Answer is required" });

    // must be assigned today
    const dt = await get(
      "SELECT id, completed_at FROM daily_tasks WHERE user_id=? AND day_key=? AND task_id=?",
      [req.user.id, dayKey, taskId]
    );
    if (!dt) return res.status(400).json({ error: "Task not assigned for today" });
    if (dt.completed_at) return res.status(400).json({ error: "Task already completed" });

    const task = await get("SELECT reward_ksh FROM tasks WHERE id=? AND active=1", [taskId]);
    if (!task) return res.status(404).json({ error: "Task not found" });

    await run("BEGIN");
    try {
      await run(
        "UPDATE daily_tasks SET completed_at=CURRENT_TIMESTAMP, answer_text=? WHERE id=?",
        [ans, dt.id]
      );
      await run(
        "INSERT INTO task_completions (user_id, task_id, reward_ksh, answer_text) VALUES (?,?,?,?)",
        [req.user.id, taskId, task.reward_ksh, ans]
      );
      await run(
        "UPDATE users SET balance_ksh = balance_ksh + ? WHERE id=?",
        [task.reward_ksh, req.user.id]
      );
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }

    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    const rows = await all(
      `SELECT dt.id AS dt_id, t.id AS id, t.type, t.category, t.title, t.prompt, t.media_url, t.reward_ksh, t.complexity,
              CASE WHEN dt.completed_at IS NULL THEN 0 ELSE 1 END AS completed, dt.answer_text
       FROM daily_tasks dt JOIN tasks t ON t.id=dt.task_id
       WHERE dt.user_id=? AND dt.day_key=?
       ORDER BY dt.id ASC
       LIMIT 5`,
      [req.user.id, dayKey]
    );
    const remaining = rows.filter(r => !r.completed).length;

    res.json({ ok: true, balance_ksh: me?.balance_ksh || 0, remaining });
  } catch (e) {
    res.status(500).json({ error: e.message || "Complete failed" });
  }
});

app.get("/api/history", requireAuth, async (req, res) => {
  const rows = await all(
    `SELECT tc.id, tc.created_at, tc.reward_ksh, t.title, t.type
     FROM task_completions tc
     JOIN tasks t ON t.id = tc.task_id
     WHERE tc.user_id = ?
     ORDER BY tc.id DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

// withdrawals (kept simple)
app.get("/api/withdrawals", requireAuth, async (req, res) => {
  const rows = await all(
    "SELECT id, amount_ksh, phone_number, method, status, created_at FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50",
    [req.user.id]
  );
  res.json(rows);
});

app.post("/api/withdrawals", requireAuth, async (req, res) => {
  try {
    const schema = z.object({
      amount: z.number().positive(),
      phone_number: z.string().min(5),
      method: z.string().min(2),
    });
    const data = schema.parse(req.body);

    const u = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    if (!u) return res.status(404).json({ error: "User not found" });
    if (u.balance_ksh < data.amount) return res.status(400).json({ error: "Insufficient balance" });

    await run("BEGIN");
    try {
      await run("UPDATE users SET balance_ksh = balance_ksh - ? WHERE id=?", [data.amount, req.user.id]);
      await run(
        "INSERT INTO withdrawals (user_id, amount_ksh, phone_number, method, status) VALUES (?,?,?,?,?)",
        [req.user.id, Math.floor(data.amount), data.phone_number, data.method, "pending"]
      );
      await run("COMMIT");
    } catch (e) {
      await run("ROLLBACK");
      throw e;
    }

    const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
    res.json({ ok: true, balance_ksh: me.balance_ksh });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

(async () => {
  try {
    await initDb();

// ---------------------------
// Withdrawals (demo)
// ---------------------------
async function ensureWithdrawalsTable() {
  await run("PRAGMA foreign_keys = ON");
  await run(`
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount_ksh INTEGER NOT NULL,
      phone_number TEXT NOT NULL,
      method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      receipt_ref TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

// GET /api/withdraw/history?userId=123
app.get("/api/withdraw/history", async (req, res) => {
  try {
    await ensureWithdrawalsTable();
    const userId = Number(req.query.userId);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ error: "userId (number) is required" });
    }

    const rows = await all(
      `SELECT id, user_id, amount_ksh, phone_number, method, status, receipt_ref, created_at
       FROM withdrawals
       WHERE user_id = ?
       ORDER BY datetime(created_at) DESC, id DESC`,
      [userId]
    );

    return res.json({ withdrawals: rows });
  } catch (e) {
    console.error("/api/withdraw/history failed:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/withdraw/request
// body: { userId, amount_ksh, phone_number, method }
app.post("/api/withdraw/request", async (req, res) => {
  try {
    await ensureWithdrawalsTable();
    const userId = Number(req.body?.userId);
    const amount = Number(req.body?.amount_ksh);
    const phone = String(req.body?.phone_number ?? "").trim();
    const method = String(req.body?.method ?? "").trim() || "mpesa";

    if (!Number.isFinite(userId) || !Number.isFinite(amount) || amount <= 0 || !phone) {
      return res.status(400).json({
        error: "userId (number), amount_ksh (positive number), phone_number (string) are required"
      });
    }

    const out = await run(
      `INSERT INTO withdrawals (user_id, amount_ksh, phone_number, method, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [userId, int(amount), phone, method]
    );

    return res.json({ ok: true, withdrawal_id: out?.lastID ?? null, status: "pending" });
  } catch (e) {
    console.error("/api/withdraw/request failed:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/withdraw/mark-paid
// body: { withdrawal_id, receipt_ref }
app.post("/api/withdraw/mark-paid", async (req, res) => {
  try {
    await ensureWithdrawalsTable();
    const withdrawalId = Number(req.body?.withdrawal_id);
    const receiptRef = String(req.body?.receipt_ref ?? "").trim();

    if (!Number.isFinite(withdrawalId) || !receiptRef) {
      return res.status(400).json({ error: "withdrawal_id (number) and receipt_ref (string) are required" });
    }

    await run(
      `UPDATE withdrawals
       SET status = 'paid', receipt_ref = ?
       WHERE id = ?`,
      [receiptRef, int(withdrawalId)]
    );

    return res.json({ ok: true });
  } catch (e) {
    console.error("/api/withdraw/mark-paid failed:", e);
    return res.status(500).json({ error: "Internal server error" });
  }
});

function int(x) {
  // SQLite stores integers fine; ensure we pass an integer
  return Math.trunc(x);
}

    app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
  } catch (e) {
    console.error("DB init failed:", e);
    process.exit(1);
  }
})();
