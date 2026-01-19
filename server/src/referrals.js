const express = require("express");
const { requireAuth } = require("./auth");
const { get, all, run } = require("./db");

const router = express.Router();

// Stats for logged-in user
router.get("/stats", requireAuth, async (req, res) => {
  const userId = req.user.id;

  const me = await get(
    "SELECT id, referral_code, bonus_ksh, balance_ksh FROM users WHERE id = ?",
    [userId]
  );
  if (!me) return res.status(404).json({ error: "User not found" });

  const countRow = await get(
    "SELECT COUNT(*) AS c FROM referrals WHERE referrer_id = ?",
    [userId]
  );

  const bonus = Number(me.bonus_ksh || 0);
  const redeemable = bonus >= 1000 ? Math.floor(bonus / 1000) * 1000 : 0;

  return res.json({
    referral_code: me.referral_code,
    referrals_count: Number(countRow?.c || 0),
    bonus_ksh: bonus,
    redeemable_ksh: redeemable,
    balance_ksh: Number(me.balance_ksh || 0),
  });
});

// List referred users (username + date)
router.get("/list", requireAuth, async (req, res) => {
  const userId = req.user.id;

  const rows = await all(
    `
    SELECT
      r.id,
      r.created_at,
      u.username AS referred_username,
      u.email AS referred_email
    FROM referrals r
    JOIN users u ON u.id = r.referred_user_id
    WHERE r.referrer_id = ?
    ORDER BY r.created_at DESC
    LIMIT 200
    `,
    [userId]
  );

  res.json(rows || []);
});

// Redeem bonus: EXACTLY KSH 1000 per click (if available)
router.post("/redeem", requireAuth, async (req, res) => {
  const userId = req.user.id;

  const me = await get("SELECT id, bonus_ksh, balance_ksh FROM users WHERE id = ?", [userId]);
  if (!me) return res.status(404).json({ error: "User not found" });

  const bonus = Number(me.bonus_ksh || 0);
  if (bonus < 1000) {
    return res.status(400).json({ error: "Bonus must reach KSH 1000 to redeem." });
  }

  const redeemAmount = 1000;

  await run(
    "UPDATE users SET balance_ksh = balance_ksh + ?, bonus_ksh = bonus_ksh - ? WHERE id = ?",
    [redeemAmount, redeemAmount, userId]
  );

  await run("INSERT INTO bonus_redemptions (user_id, amount_ksh) VALUES (?, ?)", [userId, redeemAmount]);

  const after = await get("SELECT balance_ksh, bonus_ksh FROM users WHERE id = ?", [userId]);
  return res.json({
    ok: true,
    redeemed_ksh: redeemAmount,
    balance_ksh: Number(after.balance_ksh || 0),
    bonus_ksh: Number(after.bonus_ksh || 0),
  });
});

module.exports = router;
