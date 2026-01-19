const express = require("express");
const bcrypt = require("bcryptjs");
const { z } = require("zod");
const { requireAuth } = require("./auth");
const { get, run, all } = require("./db");

const router = express.Router();

router.get("/status", requireAuth, async (req, res) => {
  const u = await get(
    `SELECT id, username, email, phone, referral_code,
            balance_ksh,
            COALESCE(bonus_ksh,0) AS bonus_ksh,
            COALESCE(full_name,'') AS full_name,
            COALESCE(payment_number,'') AS payment_number,
            delete_requested_at, delete_effective_at
     FROM users WHERE id = ?`,
    [req.user.id]
  );
  res.json(u || { error: "User not found" });
});

router.put("/profile", requireAuth, async (req, res) => {
  const schema = z.object({
    full_name: z.string().optional(),
    phone: z.string().optional(),
    payment_number: z.string().optional(),
  });
  const body = schema.parse(req.body || {});
  await run(
    `UPDATE users SET
      full_name = COALESCE(?, full_name),
      phone = COALESCE(?, phone),
      payment_number = COALESCE(?, payment_number)
     WHERE id = ?`,
    [body.full_name ?? null, body.phone ?? null, body.payment_number ?? null, req.user.id]
  );
  const updated = await get(
    `SELECT id, username, email, phone, referral_code,
            balance_ksh,
            COALESCE(bonus_ksh,0) AS bonus_ksh,
            COALESCE(full_name,'') AS full_name,
            COALESCE(payment_number,'') AS payment_number,
            delete_requested_at, delete_effective_at
     FROM users WHERE id = ?`,
    [req.user.id]
  );
  res.json(updated);
});

router.post("/password", requireAuth, async (req, res) => {
  const schema = z.object({
    current: z.string().min(1),
    next: z.string().min(6),
  });

  const raw = req.body || {};
  const data = schema.parse({
    current: raw.current_password ?? raw.currentPassword ?? raw.current ?? "",
    next: raw.new_password ?? raw.newPassword ?? raw.next ?? "",
  });

  const user = await get("SELECT password_hash FROM users WHERE id = ?", [req.user.id]);
  if (!user) return res.status(404).json({ error: "User not found" });

  const ok = await bcrypt.compare(data.current, user.password_hash);
  if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

  const hash = await bcrypt.hash(data.next, 10);
  await run("UPDATE users SET password_hash = ? WHERE id = ?", [hash, req.user.id]);
  res.json({ ok: true });
});

router.post("/delete-request", requireAuth, async (req, res) => {
  await run(
    `UPDATE users
     SET delete_requested_at = datetime('now'),
         delete_effective_at = datetime('now','+7 days')
     WHERE id = ?`,
    [req.user.id]
  );
  const u = await get("SELECT delete_requested_at, delete_effective_at FROM users WHERE id = ?", [req.user.id]);
  res.json({ ok: true, ...u });
});

router.post("/cancel-delete", requireAuth, async (req, res) => {
  await run(
    "UPDATE users SET delete_requested_at = NULL, delete_effective_at = NULL WHERE id = ?",
    [req.user.id]
  );
  res.json({ ok: true });
});

router.get("/referrals", requireAuth, async (req, res) => {
  const rows = await all(
    `SELECT username, email, created_at
     FROM users
     WHERE referred_by = ?
     ORDER BY id DESC
     LIMIT 200`,
    [req.user.id]
  );
  res.json(rows);
});

router.post("/redeem", requireAuth, async (req, res) => {
  const u = await get(
    "SELECT COALESCE(bonus_ksh,0) AS bonus_ksh, balance_ksh FROM users WHERE id = ?",
    [req.user.id]
  );
  if (!u) return res.status(404).json({ error: "User not found" });
  if (u.bonus_ksh < 1000) return res.status(400).json({ error: "Bonus must reach KSH 1000 to redeem" });

  await run(
    "UPDATE users SET bonus_ksh = bonus_ksh - 1000, balance_ksh = balance_ksh + 1000 WHERE id = ?",
    [req.user.id]
  );
  const updated = await get(
    "SELECT COALESCE(bonus_ksh,0) AS bonus_ksh, balance_ksh FROM users WHERE id = ?",
    [req.user.id]
  );
  res.json({ ok: true, ...updated });
});

module.exports = router;
