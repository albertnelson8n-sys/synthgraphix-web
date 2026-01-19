const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { initDb, run, get, all } = require("./db");

const PORT = Number(process.env.PORT || 5175);
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function dayKeyNairobi() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowIso() {
  return new Date().toISOString();
}

function randomReferralCode(len = 8) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function signToken(userId) {
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: "7d" });
}

function requireAuth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const m = h.match(/^Bearer\s+(.+)$/i);
    if (!m) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// ---- Daily task assignment (max 5/day, resets at midnight Nairobi, no duplicates per type) ----
async function ensureDailyTasks(userId, dayKey) {
  try {
    await run("PRAGMA foreign_keys = ON");

    const u = await get("SELECT id FROM users WHERE id=?", [userId]);
    if (!u) return;

    // cleanup any broken rows to avoid FK crashes
    await run("DELETE FROM daily_tasks WHERE user_id=? AND task_id NOT IN (SELECT id FROM tasks)", [userId]);

    const existing = await all(
      "SELECT dt.task_id, t.type FROM daily_tasks dt JOIN tasks t ON t.id=dt.task_id WHERE dt.user_id=? AND dt.day_key=?",
      [userId, dayKey]
    );
    const existingTypes = new Set(existing.map((r) => (r.type || "").toLowerCase()));
    const limit = 5;
    const need = Math.max(0, limit - existing.length);
    if (need === 0) return;

    // pull many candidates then choose distinct types
    const candidates = await all("SELECT id, type FROM tasks WHERE active=1 ORDER BY RANDOM() LIMIT 500");
    const picks = [];
    for (const c of candidates) {
      if (picks.length >= need) break;
      const t = (c.type || "").toLowerCase();
      if (!t || existingTypes.has(t)) continue;
      existingTypes.add(t);
      picks.push(c.id);
    }

    for (const taskId of picks) {
      await run(
        "INSERT OR IGNORE INTO daily_tasks (user_id, day_key, task_id, assigned_at) VALUES (?,?,?,CURRENT_TIMESTAMP)",
        [userId, dayKey, taskId]
      );
    }
  } catch (e) {
    console.error("ensureDailyTasks failed:", e);
  }
}

async function main() {
  await initDb();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  // Never let unhandled errors kill the process
  process.on("unhandledRejection", (err) => console.error("unhandledRejection:", err));
  process.on("uncaughtException", (err) => console.error("uncaughtException:", err));

  app.get("/api/health", (req, res) => res.json({ ok: true, time: nowIso() }));

  // --- AUTH ---
  app.post("/api/auth/register", async (req, res) => {
    const schema = z.object({
      username: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(6),
      referralCode: z.string().optional().nullable(),
    });

    try {
      const data = schema.parse(req.body);
      const referral_code = randomReferralCode();

      let referred_by = null;
      const ref = (data.referralCode || "").trim();
      if (ref) {
        const r = await get("SELECT id FROM users WHERE referral_code=?", [ref]);
        if (r) referred_by = r.id;
      }

      const hash = await bcrypt.hash(data.password, 10);

      const r = await run(
        "INSERT INTO users (username,email,password_hash,referral_code,referred_by) VALUES (?,?,?,?,?)",
        [data.username, data.email, hash, referral_code, referred_by]
      );

      const token = signToken(r.lastID);
      res.json({ token });
    } catch (e) {
      res.status(400).json({ error: e.message || "Bad request" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });

    try {
      const data = schema.parse(req.body);
      const user = await get("SELECT id, password_hash FROM users WHERE email=?", [data.email]);
      if (!user) return res.status(400).json({ error: "Invalid credentials" });

      const ok = await bcrypt.compare(data.password, user.password_hash);
      if (!ok) return res.status(400).json({ error: "Invalid credentials" });

      res.json({ token: signToken(user.id) });
    } catch (e) {
      res.status(400).json({ error: e.message || "Bad request" });
    }
  });

  // --- ME / ACCOUNT ---
  app.get("/api/me", requireAuth, async (req, res) => {
    try {
      const u = await get(
        `SELECT id, username, email, phone, referral_code, balance_ksh,
                COALESCE(bonus_ksh,0) AS bonus_ksh,
                COALESCE(full_name,'') AS full_name,
                COALESCE(payment_number,'') AS payment_number,
                created_at, delete_requested_at, delete_effective_at
         FROM users WHERE id=?`,
        [req.user.id]
      );
      if (!u) return res.status(404).json({ error: "User not found" });
      res.json(u);
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.put("/api/me", requireAuth, async (req, res) => {
    const schema = z.object({
      full_name: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      payment_number: z.string().optional().nullable(),
    });

    try {
      const body = schema.parse(req.body || {});
      await run(
        "UPDATE users SET full_name=COALESCE(?,full_name), phone=COALESCE(?,phone), payment_number=COALESCE(?,payment_number) WHERE id=?",
        [
          body.full_name === null ? "" : body.full_name,
          body.phone === null ? "" : body.phone,
          body.payment_number === null ? "" : body.payment_number,
          req.user.id,
        ]
      );

      const u = await get(
        `SELECT id, username, email, phone, referral_code, balance_ksh,
                COALESCE(bonus_ksh,0) AS bonus_ksh,
                COALESCE(full_name,'') AS full_name,
                COALESCE(payment_number,'') AS payment_number,
                created_at, delete_requested_at, delete_effective_at
         FROM users WHERE id=?`,
        [req.user.id]
      );
      res.json(u);
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
      const body = schema.parse(req.body || {});
      const u = await get("SELECT password_hash FROM users WHERE id=?", [req.user.id]);
      if (!u) return res.status(404).json({ error: "User not found" });

      const ok = await bcrypt.compare(body.currentPassword, u.password_hash);
      if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

      const hash = await bcrypt.hash(body.newPassword, 10);
      await run("UPDATE users SET password_hash=? WHERE id=?", [hash, req.user.id]);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message || "Bad request" });
    }
  });

  app.post("/api/account/delete-request", requireAuth, async (req, res) => {
    try {
      const effective = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
      await run(
        "UPDATE users SET delete_requested_at=CURRENT_TIMESTAMP, delete_effective_at=? WHERE id=?",
        [effective, req.user.id]
      );
      res.json({ ok: true, delete_effective_at: effective });
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // --- REFERRALS ---
  app.get("/api/referrals/status", requireAuth, async (req, res) => {
    try {
      const row = await get("SELECT COUNT(*) AS c FROM users WHERE referred_by=?", [req.user.id]);
      const me = await get("SELECT COALESCE(bonus_ksh,0) AS bonus_ksh FROM users WHERE id=?", [req.user.id]);
      res.json({ referrals: row?.c || 0, bonus_ksh: me?.bonus_ksh || 0 });
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // --- TASKS ---
  app.get("/api/tasks", requireAuth, async (req, res) => {
    try {
      const dayKey = dayKeyNairobi();
      await ensureDailyTasks(req.user.id, dayKey);

      const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);

      const rows = await all(
        `SELECT dt.task_id, dt.completed_at, dt.answer_text,
                t.type, t.category, t.title, t.description, t.prompt, t.media_url, t.reward_ksh, t.complexity
         FROM daily_tasks dt
         JOIN tasks t ON t.id = dt.task_id
         WHERE dt.user_id=? AND dt.day_key=?
         ORDER BY dt.id ASC`,
        [req.user.id, dayKey]
      );

      const completed = rows.filter((r) => r.completed_at).length;

      res.json({
        day_key: dayKey,
        remaining: Math.max(0, 5 - completed),
        balance_ksh: me?.balance_ksh || 0,
        tasks: rows.map((r) => ({
          id: r.task_id,
          type: r.type,
          category: r.category,
          title: r.title,
          description: r.description,
          prompt: r.prompt,
          media_url: r.media_url,
          reward_ksh: r.reward_ksh,
          complexity: r.complexity,
          completed: !!r.completed_at,
          answer_text: r.answer_text || "",
        })),
      });
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.post("/api/tasks/:id/complete", requireAuth, async (req, res) => {
    try {
      const taskId = Number(req.params.id);
      const dayKey = dayKeyNairobi();
      const answer_text = (req.body?.answer_text || req.body?.answer || "").toString().trim();
      if (answer_text.length < 2) return res.status(400).json({ error: "Please enter your answer/transcription." });

      const assigned = await get(
        "SELECT id, completed_at FROM daily_tasks WHERE user_id=? AND day_key=? AND task_id=?",
        [req.user.id, dayKey, taskId]
      );
      if (!assigned) return res.status(400).json({ error: "This task is not assigned to you today." });
      if (assigned.completed_at) return res.status(400).json({ error: "Task already completed." });

      const task = await get("SELECT reward_ksh FROM tasks WHERE id=? AND active=1", [taskId]);
      if (!task) return res.status(404).json({ error: "Task not found." });

      await run("BEGIN");
      try {
        await run("UPDATE daily_tasks SET completed_at=CURRENT_TIMESTAMP, answer_text=? WHERE id=?", [
          answer_text,
          assigned.id,
        ]);
        await run(
          "INSERT INTO task_completions (user_id, task_id, day_key, reward_ksh, answer_text) VALUES (?,?,?,?,?)",
          [req.user.id, taskId, dayKey, task.reward_ksh, answer_text]
        );
        await run("UPDATE users SET balance_ksh = balance_ksh + ? WHERE id=?", [task.reward_ksh, req.user.id]);

        const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
        await run("COMMIT");
        res.json({ ok: true, balance_ksh: me.balance_ksh });
      } catch (e) {
        await run("ROLLBACK");
        res.status(400).json({ error: e.message || "Bad request" });
      }
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.get("/api/tasks/history", requireAuth, async (req, res) => {
    try {
      const rows = await all(
        `SELECT tc.id, tc.created_at, tc.reward_ksh, tc.answer_text,
                t.title, t.type, t.category
         FROM task_completions tc
         JOIN tasks t ON t.id = tc.task_id
         WHERE tc.user_id=?
         ORDER BY tc.id DESC
         LIMIT 50`,
        [req.user.id]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  // --- WITHDRAWALS (basic demo) ---
  app.post("/api/withdraw", requireAuth, async (req, res) => {
    const schema = z.object({
      amount_ksh: z.number().int().positive(),
      phone_number: z.string().min(6),
      method: z.string().min(2),
    });

    try {
      const body = schema.parse(req.body || {});
      const me = await get("SELECT balance_ksh FROM users WHERE id=?", [req.user.id]);
      if (!me) return res.status(404).json({ error: "User not found" });
      if (body.amount_ksh > me.balance_ksh) return res.status(400).json({ error: "Insufficient balance" });

      await run(
        "INSERT INTO withdrawals (user_id, amount_ksh, phone_number, method, status) VALUES (?,?,?,?,?)",
        [req.user.id, body.amount_ksh, body.phone_number, body.method, "pending"]
      );
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: e.message || "Bad request" });
    }
  });

  app.get("/api/withdraw/history", requireAuth, async (req, res) => {
    try {
      const rows = await all(
        "SELECT id, amount_ksh, phone_number, method, status, created_at FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 50",
        [req.user.id]
      );
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message || "Server error" });
    }
  });

  app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
}

main().catch((e) => {
  console.error("Fatal startup error:", e);
  process.exit(1);
});
