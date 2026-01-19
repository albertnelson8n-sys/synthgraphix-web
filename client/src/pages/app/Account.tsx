import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";

type Me = {
  id: number;
  username: string;
  email: string;
  phone: string;
  referral_code: string;
  balance_ksh: number;
  bonus_ksh: number;
  full_name: string;
  payment_number: string;
  delete_requested_at?: string | null;
  delete_effective_at?: string | null;
};

export default function Account() {
  const [me, setMe] = useState<Me | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentNumber, setPaymentNumber] = useState("");

  const [referrals, setReferrals] = useState(0);
  const [bonusKsh, setBonusKsh] = useState(0);

  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const [saving, setSaving] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  const [delLoading, setDelLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);

  const referralLink = useMemo(() => {
    const code = me?.referral_code || "";
    return `${window.location.origin}/register?ref=${encodeURIComponent(code)}`;
  }, [me?.referral_code]);

  async function loadAll() {
    setErr("");
    try {
      const m = await api<Me>("/me");
      setMe(m);
      setFullName(m.full_name || "");
      setPhone(m.phone || "");
      setPaymentNumber(m.payment_number || "");

      const r = await api<{ referrals: number; bonus_ksh: number }>("/referrals/status");
      setReferrals(r.referrals || 0);
      setBonusKsh(Number(r.bonus_ksh || 0));
    } catch (e: any) {
      setErr(e.message || "Failed to load account");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const toastTimer = useRef<number | null>(null);

  function clearFlash() {
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }

  function flashSuccess(text: string) {
    clearFlash();
    setMsg(text);
    setErr("");
    toastTimer.current = window.setTimeout(() => setMsg(""), 3500);
  }

  function flashError(text: string) {
    clearFlash();
    setErr(text);
    setMsg("");
    toastTimer.current = window.setTimeout(() => setErr(""), 5000);
  }

  async function onSaveProfile() {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const updated = await api<Me>("/me", {
        method: "PUT",
        body: { full_name: fullName, phone, payment_number: paymentNumber },
      });
      setMe(updated);
      setFullName((updated as any).full_name || "");
      setPhone((updated as any).phone || "");
      setPaymentNumber((updated as any).payment_number || "");
      flashSuccess("Saved successfully ✓");
      // refresh referral stats too
      const r = await api<{ referrals: number; bonus_ksh: number }>("/referrals/status");
      setReferrals(r.referrals || 0);
      setBonusKsh(Number(r.bonus_ksh || 0));
    } catch (e: any) {
      flashError(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onUpdatePassword() {
    setPwSaving(true);
    setMsg("");
    setErr("");
    try {
      if (!curPw) throw new Error("Enter your current password");
      if (!newPw || newPw.length < 6) throw new Error("New password must be at least 6 characters");
      if (newPw !== newPw2) throw new Error("Passwords do not match");

      await api<{ ok: true }>("/me/password", {
        method: "POST",
        body: { currentPassword: curPw, newPassword: newPw },
      });

      setCurPw("");
      setNewPw("");
      setNewPw2("");
      flashSuccess("Password updated ✓");
    } catch (e: any) {
      flashError(e.message || "Password update failed");
    } finally {
      setPwSaving(false);
    }
  }

  async function onRequestDeletion() {
    setDelLoading(true);
    setMsg("");
    setErr("");
    try {
      const r = await api<{ ok: true; delete_effective_at: string }>("/me/delete-request", { method: "POST" });
      flashSuccess(`Deletion scheduled. Account will be removed after 7 days (${r.delete_effective_at}).`);
      await loadAll();
    } catch (e: any) {
      flashError(e.message || "Deletion request failed");
    } finally {
      setDelLoading(false);
    }
  }

  async function onCancelDeletion() {
    setDelLoading(true);
    setMsg("");
    setErr("");
    try {
      await api<{ ok: true }>("/me/delete-cancel", { method: "POST" });
      flashSuccess("Deletion request canceled ✓");
      await loadAll();
    } catch (e: any) {
      flashError(e.message || "Cancel failed");
    } finally {
      setDelLoading(false);
    }
  }

  async function onRedeem() {
    setRedeemLoading(true);
    setMsg("");
    setErr("");
    try {
      await api("/referrals/redeem", { method: "POST" });
      flashSuccess("Redeemed KSH 1000 into your main balance ✓");
      await loadAll();
    } catch (e: any) {
      flashError(e.message || "Redeem failed");
    } finally {
      setRedeemLoading(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referralLink);
      flashSuccess("Referral link copied ✓");
    } catch {
      flashError("Could not copy link");
    }
  }

  const canRedeem = bonusKsh >= 1000;
  const remaining = Math.max(0, 1000 - bonusKsh);
  const progress = Math.min(100, Math.round((bonusKsh / 1000) * 100));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-xl font-semibold text-white mb-2">Account Management</h1>

      {(msg || err) && (
        <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${err ? "border-red-500/40 bg-red-500/10 text-red-200" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"}`}>
          {err || msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Personal info */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="text-white font-semibold">Personal Information</div>
          <div className="text-white/60 text-sm mb-4">Manage your profile & payout details.</div>

          <label className="block text-white/70 text-xs mb-1">Full Name</label>
          <input
            className="w-full mb-3 rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white outline-none focus:border-emerald-400/50"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your full name"
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-white/70 text-xs mb-1">Username</label>
              <input className="w-full rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-white/70" value={me?.username || ""} disabled />
            </div>
            <div>
              <label className="block text-white/70 text-xs mb-1">Phone</label>
              <input
                className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white outline-none focus:border-emerald-400/50"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="07XXXXXXXX"
              />
            </div>
          </div>

          <label className="block text-white/70 text-xs mb-1">Payment Number (M-Pesa / Airtel Money)</label>
          <input
            className="w-full mb-4 rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white outline-none focus:border-emerald-400/50"
            value={paymentNumber}
            onChange={(e) => setPaymentNumber(e.target.value)}
            placeholder="e.g. 07XXXXXXXX"
          />

          <button
            onClick={onSaveProfile}
            disabled={saving}
            className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-5 py-2 text-white font-semibold"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>

        {/* Summary + bonus explanation */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-white font-semibold mb-3">Account Summary</div>
            <div className="text-sm text-white/70 flex justify-between"><span>Status</span><span className="text-emerald-300">Active</span></div>
            <div className="text-sm text-white/70 flex justify-between"><span>Email</span><span className="text-white">{me?.email || ""}</span></div>
            <div className="text-sm text-white/70 flex justify-between"><span>Main Balance</span><span className="text-white">KSH {Number(me?.balance_ksh || 0).toFixed(2)}</span></div>
            <div className="text-sm text-white/70 flex justify-between"><span>Referral Code</span><span className="text-white">{me?.referral_code || ""}</span></div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-white font-semibold mb-2">How bonuses work</div>
            <ul className="text-sm text-white/70 space-y-1 list-disc pl-5">
              <li>You earn <b className="text-white">KSH 100</b> for every verified referral.</li>
              <li>Bonus is stored in your <b className="text-white">Bonus Wallet</b>.</li>
              <li>You can redeem only when bonus reaches <b className="text-white">KSH 1000+</b>.</li>
              <li>Redeem moves <b className="text-white">KSH 1000</b> into your main balance.</li>
            </ul>
          </div>
        </div>

        {/* Referral program */}
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-semibold">Referral Program</div>
              <div className="text-white/60 text-sm">Bonus becomes redeemable only when it reaches KSH 1000+.</div>
            </div>
            <span className="text-xs rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 px-3 py-1">+KSH 100 / referral</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/60 text-xs">Referrals</div>
              <div className="text-white text-lg font-semibold">{referrals}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/60 text-xs">Bonus Wallet</div>
              <div className="text-white text-lg font-semibold">KSH {bonusKsh.toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-white/60 text-xs">To Redeem</div>
              <div className="text-white text-lg font-semibold">{remaining <= 0 ? "Ready" : `KSH ${remaining.toFixed(2)} left`}</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="text-white/70 text-xs mb-2">Your referral link</div>
            <div className="flex gap-2">
              <input className="flex-1 rounded-xl bg-black/30 border border-white/10 px-3 py-2 text-white/90" value={referralLink} readOnly />
              <button onClick={copyLink} className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-white text-sm">Copy</button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <a
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-white text-sm"
                target="_blank"
                href={`https://wa.me/?text=${encodeURIComponent("Join Synthgraphix using my referral link: " + referralLink)}`}
              >
                WhatsApp
              </a>
              <a
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-white text-sm"
                target="_blank"
                href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent("Join Synthgraphix using my referral link!")}`}
              >
                Telegram
              </a>

              <button
                onClick={onRedeem}
                disabled={!canRedeem || redeemLoading}
                className={`ml-auto rounded-xl px-4 py-2 text-sm font-semibold ${canRedeem ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-white/10 text-white/50"} disabled:opacity-60`}
              >
                {redeemLoading ? "Redeeming..." : "Redeem 1000"}
              </button>
            </div>

            <div className="mt-4">
              <div className="text-white/60 text-xs mb-1">Progress to next KSH 1000</div>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-2 bg-emerald-500" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-white/50 text-xs mt-1">{progress}%</div>
            </div>
          </div>
        </div>

        {/* Password + deletion */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-white font-semibold mb-3">Update Password</div>

            <label className="block text-white/70 text-xs mb-1">Current Password</label>
            <input className="w-full mb-3 rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white" type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} />

            <label className="block text-white/70 text-xs mb-1">New Password</label>
            <input className="w-full mb-3 rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />

            <label className="block text-white/70 text-xs mb-1">Confirm New Password</label>
            <input className="w-full mb-4 rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />

            <button onClick={onUpdatePassword} disabled={pwSaving} className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 px-5 py-2 text-white font-semibold">
              {pwSaving ? "Updating..." : "Update Password"}
            </button>
          </div>

          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-5">
            <div className="text-white font-semibold mb-2">Account Deletion</div>
            <div className="text-white/70 text-sm mb-3">
              When you request deletion, your account will be permanently removed after <b className="text-white">7 days</b>.
            </div>

            {me?.delete_effective_at ? (
              <div className="text-sm text-white/80 mb-3">
                Deletion scheduled for: <b className="text-white">{me.delete_effective_at}</b>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={onRequestDeletion}
                disabled={delLoading}
                className="rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 px-4 py-2 text-white font-semibold"
              >
                {delLoading ? "Sending..." : "Request Account Deletion"}
              </button>

              <button
                onClick={onCancelDeletion}
                disabled={delLoading || !me?.delete_effective_at}
                className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-60 px-4 py-2 text-white font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
