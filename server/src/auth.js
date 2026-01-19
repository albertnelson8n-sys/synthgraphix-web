const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const { run, get } = require("./db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me";

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, username: user.username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function generateReferralCode() {
  // 8 chars uppercase+digits
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let tries = 0; tries < 50; tries++) {
    let code = "";
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    const exists = await get("SELECT id FROM users WHERE referral_code = ?", [code]);
    if (!exists) return code;
  }
  throw new Error("Could not generate referral code");
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

router.post(
  "/register",
  async (req, res) => {
    const schema = z.object({
      username: z.string().min(3),
      email: z.string().email(),
      password: z.string().min(6),
      phone: z.string().optional().default(""),
      referral_code: z.string().optional().default(""),
    });

    try {
      const body = schema.parse(req.body);

      const existing = await get("SELECT id FROM users WHERE email = ? OR username = ?", [
        body.email,
        body.username,
      ]);
      if (existing) return res.status(400).json({ error: "Email or username already exists" });

      let referrer = null;
      const referralCode = (body.referral_code || "").trim();
      if (referralCode) {
        referrer = await get("SELECT id FROM users WHERE referral_code = ?", [referralCode]);
        if (!referrer) return res.status(400).json({ error: "Invalid referral code" });
      }

      const password_hash = await bcrypt.hash(body.password, 10);
      const myCode = await generateReferralCode();

      const ins = await run(
        `INSERT INTO users (username, email, password_hash, phone, referral_code, referred_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [body.username, body.email, password_hash, body.phone || "", myCode, referrer ? referrer.id : null]
      );

      const newUserId = ins.lastID;

      // Award bonus to referrer: +100 bonus_ksh and create referral record (only once per new user)
      if (referrer) {
        await run(
          `INSERT OR IGNORE INTO referrals (referrer_id, referred_user_id, bonus_awarded_ksh)
           VALUES (?, ?, 100)`,
          [referrer.id, newUserId]
        );
        await run(`UPDATE users SET bonus_ksh = COALESCE(bonus_ksh,0) + 100 WHERE id = ?`, [referrer.id]);
      }

      const user = await get(
        "SELECT id, username, email, referral_code, balance_ksh, bonus_ksh FROM users WHERE id = ?",
        [newUserId]
      );

      const token = signToken(user);
      return res.json({ token, user });
    } catch (e) {
      if (e?.issues) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: String(e.message || e) });
    }
  }
);

router.post(
  "/login",
  async (req, res) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    });

    try {
      const body = schema.parse(req.body);
      const user = await get("SELECT * FROM users WHERE email = ?", [body.email]);
      if (!user) return res.status(400).json({ error: "Invalid credentials" });

      const ok = await bcrypt.compare(body.password, user.password_hash);
      if (!ok) return res.status(400).json({ error: "Invalid credentials" });

      const token = signToken(user);
      return res.json({
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          referral_code: user.referral_code,
          balance_ksh: user.balance_ksh,
          bonus_ksh: user.bonus_ksh,
        },
      });
    } catch (e) {
      if (e?.issues) return res.status(400).json({ error: e.issues });
      return res.status(500).json({ error: String(e.message || e) });
    }
  }
);

module.exports = { router, requireAuth };
