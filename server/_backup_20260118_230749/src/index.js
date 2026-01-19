require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");

const { initDb, run, get, all } = require("./db");
const { requireAuth } = require("./auth");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5175;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function dayUTC() {
  return new Date().toISOString().slice(0, 10); // resets at UTC midnight
}

function plusDaysISO(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

async function purgeDeletedAccounts() {
  // delete accounts whose effective date has passed
  const doomed = await all(
    `SELECT id FROM users WHERE delete_effective_at IS NOT NULL AND datetime(delete_effective_at) <= datetime("now")`
  );
  for (const u of doomed) {
    await run("DELETE FROM task_completions WHERE user_id = ?", [u.id]);
    await run("DELETE FROM withdrawals WHERE user_id = ?", [u.id]);
    await run("DELETE FROM daily_tasks WHERE user_id = ?", [u.id]);
    await run("DELETE FROM referral_rewards WHERE referrer_id = ? OR referred_user_id = ?", [u.id, u.id]);
    await run("DELETE FROM users WHERE id = ?", [u.id]);
  }
}

// ---------- Auth ----------
const RegisterSchema = z.object({
  username: z.string().min(3),
  email: z.string().email(),
  password: z.string().min(6),
  referralCode: z.string().optional().default("")
});

function makeReferralCode(username) {
  const base = username.replace(/[^a-z0-9]/gi, "").slice(0, 6).toUpperCase() || "USER";
  const rand = Math.floor(1000 + Math.random() * 9000);
  return base + rand;
}

app.get("/api/health", async (req, res) => {
  await purgeDeletedAccounts();
  res.json({ ok: true });
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

    let referral_code = makeReferralCode(data.username);
    for (let i = 0; i < 8; i++) {
      const existsCode = await get("SELECT id FROM users WHERE referral_code = ?", [referral_code]);
      if (!existsCode) break;
      referral_code = makeReferralCode(data.username);
    }

    const userInsert = await run(
      `INSERT INTO users (username, email, password_hash, referral_code, referred_by, balance_ksh, bonus_ksh)
       VALUES (?, ?, ?, ?, ?, 0, 0)`,
      [data.username, data.email, password_hash, referral_code, referredById]
    );

    const token = jwt.sign({ id: userInsert.lastID }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
    const data = schema.parse(req.body);

    const user = await get("SELECT id, password_hash FROM users WHERE email = ?", [data.email]);
    if (!user) return res.status(400).json({ error: "Invalid creds" });

    const ok = await bcrypt.compare(data.password, user.password_hash);
    if (!ok) return res.status(400).json({ error: "Invalid creds" });

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// ---------- Me / Account ----------
app.get("/api/me", requireAuth, async (req, res) => {
  await purgeDeletedAccounts();

  const u = await get(
    `SELECT id, username, email,
            COALESCE(phone, "") AS phone,
            referral_code,
            balance_ksh,
            COALESCE(bonus_ksh, 0) AS bonus_ksh,
            COALESCE(full_name, "") AS full_name,
            COALESCE(payment_number, "") AS payment_number,
            created_at,
            delete_requested_at,
            delete_effective_at
     FROM users WHERE id = ?`,
    [req.user.id]
  );
  res.json(u || { error: "User not found" });
});

app.put("/api/me", requireAuth, async (req, res) => {
  const schema = z.object({
    full_name: z.string().optional(),
    phone: z.string().optional(),
    payment_number: z.string().optional()
  });

  try {
    const body = schema.parse(req.body || {});
    await run(
      `UPDATE users
       SET full_name = COALESCE(?, full_name),
           phone = COALESCE(?, phone),
           payment_number = COALESCE(?, payment_number)
       WHERE id = ?`,
      [body.full_name ?? null, body.phone ?? null, body.payment_number ?? null, req.user.id]
    );

    const updated = await get(
      `SELECT id, username, email,
              COALESCE(phone, "") AS phone,
              referral_code,
              balance_ksh,
              COALESCE(bonus_ksh, 0) AS bonus_ksh,
              COALESCE(full_name, "") AS full_name,
              COALESCE(payment_number, "") AS payment_number,
              delete_requested_at, delete_effective_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    res.json(updated);
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/me/password", requireAuth, async (req, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6)
  });

  try {
    const data = schema.parse(req.body || {});
    const user = await get("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
    if (!user) return res.status(400).json({ error: "User not found" });

    const ok = await bcrypt.compare(data.currentPassword, user.password_hash);
    if (!ok) return res.status(400).json({ error: "Current password is wrong" });

    const newHash = await bcrypt.hash(data.newPassword, 10);
    await run("UPDATE users SET password_hash = ? WHERE id = ?", [newHash, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

app.post("/api/me/delete-request", requireAuth, async (req, res) => {
  const now = new Date().toISOString();
  const effective = plusDaysISO(7);

  await run(
    `UPDATE users SET delete_requested_at = ?, delete_effective_at = ? WHERE id = ?`,
    [now, effective, req.user.id]
  );

  res.json({ ok: true, delete_effective_at: effective });
});

// ---------- Referrals ----------
app.get("/api/referrals/status", requireAuth, async (req, res) => {
  // Verified referral = referred user has at least 1 task completion (and reward granted once).
  const totalRefs = await get("SELECT COUNT(*) AS c FROM users WHERE referred_by = ?", [req.user.id]);
  const bonus = await get("SELECT COALESCE(bonus_ksh, 0) AS bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ referrals: totalRefs?.c || 0, bonus_ksh: bonus?.bonus_ksh || 0 });
});

app.post("/api/referrals/redeem", requireAuth, async (req, res) => {
  const u = await get("SELECT balance_ksh, bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  if (!u) return res.status(400).json({ error: "User not found" });
  if ((u.bonus_ksh || 0) < 1000) return res.status(400).json({ error: "Bonus must reach KSH 1000 to redeem" });

  await run("UPDATE users SET bonus_ksh = bonus_ksh - 1000, balance_ksh = balance_ksh + 1000 WHERE id = ?", [req.user.id]);
  const updated = await get("SELECT balance_ksh, bonus_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true, ...updated });
});

// ---------- Daily Tasks (max 5/day) ----------
async function ensureDailyTasks(userId) {
  const today = dayUTC();
  const existing = await all("SELECT t.* FROM daily_tasks d JOIN tasks t ON t.id = d.task_id WHERE d.user_id = ? AND d.day = ?", [userId, today]);
  if (existing.length >= 5) return existing.slice(0, 5);

  // create new set
  await run("DELETE FROM daily_tasks WHERE user_id = ? AND day = ?", [userId, today]);

  const picked = await all(
    `SELECT * FROM tasks
     WHERE active = 1
     ORDER BY RANDOM()
     LIMIT 5`
  );

  for (const t of picked) {
    await run("INSERT OR IGNORE INTO daily_tasks (user_id, day, task_id) VALUES (?, ?, ?)", [userId, today, t.id]);
  }
  return picked;
}

app.get("/api/tasks", requireAuth, async (req, res) => {
  await purgeDeletedAccounts();

  const tasks = await ensureDailyTasks(req.user.id);

  // mark completed for UI
  const completedToday = await all(
    `SELECT task_id FROM task_completions
     WHERE user_id = ? AND date(created_at) = date("now")`,
    [req.user.id]
  );
  const done = new Set(completedToday.map(r => r.task_id));

  res.json(tasks.map(t => ({
    ...t,
    completed: done.has(t.id)
  })));
});

app.post("/api/tasks/:id/complete", requireAuth, async (req, res) => {
  await purgeDeletedAccounts();

  const taskId = Number(req.params.id);
  const task = await get("SELECT id, reward_ksh FROM tasks WHERE id = ? AND active = 1", [taskId]);
  if (!task) return res.status(404).json({ error: "Task not found" });

  // enforce: only tasks assigned today can be completed
  const today = dayUTC();
  const assigned = await get("SELECT id FROM daily_tasks WHERE user_id = ? AND day = ? AND task_id = ?", [req.user.id, today, taskId]);
  if (!assigned) return res.status(400).json({ error: "Task not assigned for today" });

  // max 5 completions/day
  const cnt = await get(
    `SELECT COUNT(*) AS c FROM task_completions
     WHERE user_id = ? AND date(created_at) = date("now")`,
    [req.user.id]
  );
  if ((cnt?.c || 0) >= 5) return res.status(400).json({ error: "Daily limit reached (5 tasks/day)" });

  // record completion + pay reward
  const answer = (req.body && (req.body.answer || req.body.text || req.body.transcript)) ? String(req.body.answer || req.body.text || req.body.transcript) : "";

  await run("INSERT INTO task_completions (user_id, task_id, reward_ksh, answer_text) VALUES (?, ?, ?, ?)", [req.user.id, taskId, task.reward_ksh, answer]);
  await run("UPDATE users SET balance_ksh = balance_ksh + ? WHERE id = ?", [task.reward_ksh, req.user.id]);

  // Verified referral reward: if this user was referred, and it is their first completion, award referrer 100 bonus once.
  const me = await get("SELECT id, referred_by FROM users WHERE id = ?", [req.user.id]);
  if (me && me.referred_by) {
    const anyCompletion = await get("SELECT COUNT(*) AS c FROM task_completions WHERE user_id = ?", [me.id]);
    if ((anyCompletion?.c || 0) === 1) {
      const already = await get(
        "SELECT id FROM referral_rewards WHERE referrer_id = ? AND referred_user_id = ?",
        [me.referred_by, me.id]
      );
      if (!already) {
        await run("INSERT INTO referral_rewards (referrer_id, referred_user_id) VALUES (?, ?)", [me.referred_by, me.id]);
        await run("UPDATE users SET bonus_ksh = bonus_ksh + 100 WHERE id = ?", [me.referred_by]);
      }
    }
  }

  const updated = await get("SELECT balance_ksh FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true, balance_ksh: updated.balance_ksh });
});

app.get("/api/history", requireAuth, async (req, res) => {
  const rows = await all(
    `SELECT tc.id, tc.created_at, tc.reward_ksh, tc.answer_text, t.title, t.category, t.task_type
     FROM task_completions tc
     JOIN tasks t ON t.id = tc.task_id
     WHERE tc.user_id = ?
     ORDER BY tc.id DESC
     LIMIT 50`,
    [req.user.id]
  );
  res.json(rows);
});

// ---------- Withdrawals ----------
app.get("/api/withdrawals", requireAuth, async (req, res) => {
  const rows = await all(
    "SELECT id, amount_ksh, phone_number, method, status, created_at FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 50",
    [req.user.id]
  );
  res.json(rows);
});

app.post("/api/withdrawals", requireAuth, async (req, res) => {
  const schema = z.object({
    amount: z.number().positive(),
    phone: z.string().min(6),
    method: z.string().min(2)
  });

  try {
    const data = schema.parse(req.body);

    const u = await get("SELECT balance_ksh FROM users WHERE id = ?", [req.user.id]);
    if (!u) return res.status(400).json({ error: "User not found" });
    if (u.balance_ksh < data.amount) return res.status(400).json({ error: "Insufficient balance" });

    // create pending withdrawal
    await run(
      "INSERT INTO withdrawals (user_id, amount_ksh, phone_number, method, status) VALUES (?, ?, ?, ?, ?)",
      [req.user.id, Math.floor(data.amount), data.phone, data.method, "pending"]
    );

    // for demo: deduct immediately
    await run("UPDATE users SET balance_ksh = balance_ksh - ? WHERE id = ?", [Math.floor(data.amount), req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message || "Bad request" });
  }
});

// ---------- Start ----------
(async () => {
  await initDb();
  // seed tasks if needed
  require("./migrate");
  setInterval(purgeDeletedAccounts, 60 * 60 * 1000); // hourly
  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
})().catch((e) => {
  console.error("Boot failed:", e);
  process.exit(1);
});
