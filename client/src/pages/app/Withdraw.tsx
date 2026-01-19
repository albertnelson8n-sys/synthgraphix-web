import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type WithdrawRow = {
  id: number;
  created_at: string;
  receipt_ref?: string | null;
  amount_ksh: number;
  phone?: string | null;
  phone_number?: string | null;
  method: string;
  status: string;
};

type Slide = {
  tag: string;
  title: string;
  subtitle: string;
  bg?: string;
};

function fmtKsh(n: number) {
  try {
    return new Intl.NumberFormat("en-KE").format(n);
  } catch {
    return String(n);
  }
}

export default function Withdraw() {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<string>("M-Pesa");
  const [phone, setPhone] = useState<string>("");

  const [history, setHistory] = useState<WithdrawRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const slides: Slide[] = useMemo(
    () => [
      {
        tag: "WITHDRAW TAB",
        title: "INSTANT CASHOUT",
        subtitle: "Request withdrawals in seconds. Confirm your phone number before submitting.",
      },
      {
        tag: "SECURITY",
        title: "SECURE PAYOUTS",
        subtitle: "Your requests are tied to your account. Clear status updates keep everything transparent.",
      },
      {
        tag: "MOBILE MONEY",
        title: "M-PESA & AIRTEL MONEY",
        subtitle: "Cash out to mobile money quickly. Always confirm your payment number before submit.",
      },
      {
        tag: "TRACKING",
        title: "REAL-TIME HISTORY",
        subtitle: "See your most recent withdrawal requests and statuses in your history table.",
      },
    ],
    []
  );

  const [slideIdx, setSlideIdx] = useState(2);

  useEffect(() => {
    const t = window.setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 6000);
    return () => window.clearInterval(t);
  }, [slides.length]);

  const canSubmit = useMemo(() => {
    const a = Number(amount || 0);
    return Number.isFinite(a) && a > 0 && phone.trim().length >= 8 && !loading;
  }, [amount, phone, loading]);

  function flashOk(text: string) {
    setMsg(text);
    setErr("");
    window.setTimeout(() => setMsg(""), 3500);
  }
  function flashErr(text: string) {
    setErr(text);
    setMsg("");
  }

  async function loadHistory() {
    setLoadingHistory(true);
    setErr("");
    try {
      let rows: any = null;
      try {
        rows = await api<WithdrawRow[]>("/withdrawals");
      } catch {
        try {
          rows = await api<WithdrawRow[]>("/withdraw/history");
        } catch {
          rows = await api<WithdrawRow[]>("/withdrawals/history");
        }
      }
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      setHistory([]);
      flashErr(e?.message || "Failed to load withdrawal history");
    } finally {
      setLoadingHistory(false);
    }
  }

  async function submitWithdraw() {
    setLoading(true);
    setMsg("");
    setErr("");
    try {
      const a = Math.floor(Number(amount || 0));
      const p = phone.trim();

      if (!Number.isFinite(a) || a <= 0) throw new Error("Enter a valid amount");
      if (p.length < 8) throw new Error("Enter a valid phone number");

      const payload: any = {
        amount: a,
        amount_ksh: a,
        phone_number: p,
        phoneNumber: p,
        method,
      };

      try {
        await api("/withdrawals", { method: "POST", body: payload });
      } catch {
        await api("/withdraw/request", { method: "POST", body: payload });
      }

      flashOk("Withdrawal request submitted ✓");
      setAmount("");
      await loadHistory();
    } catch (e: any) {
      flashErr(e?.message || "Submit failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = slides[slideIdx];

  return (
    <div className="w-full">
      <style>{`
        @property --neon {
          syntax: "<color>";
          inherits: true;
          initial-value: #22c55e;
        }
        .neonTitle {
          --neon: #22c55e;
          font-weight: 900;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          line-height: 1.05;

          /* Visible base fill */
          color: rgba(255, 255, 255, 0.96);

          /* Subtle edge to make it pop on any background */
          -webkit-text-stroke: 1px rgba(255, 255, 255, 0.08);

          /* 3D depth (dark underlay) + neon glow (colored) */
          text-shadow:
            0 1px 0 rgba(0,0,0,0.85),
            0 2px 0 rgba(0,0,0,0.80),
            0 3px 0 rgba(0,0,0,0.75),
            0 4px 0 rgba(0,0,0,0.70),
            0 5px 0 rgba(0,0,0,0.65),
            0 10px 24px rgba(0,0,0,0.55),

            0 0 10px var(--neon),
            0 0 22px color-mix(in srgb, var(--neon) 70%, transparent),
            0 0 40px color-mix(in srgb, var(--neon) 55%, transparent);
        }
        .neonCycle { animation: neonCycle 3.6s linear infinite; }
        @keyframes neonCycle {
          0% { --neon: #22c55e; }
          33% { --neon: #ef4444; }
          66% { --neon: #3b82f6; }
          100% { --neon: #22c55e; }
        }
        .neonTag {
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.35em;
          color: rgba(255,255,255,0.75);
        }
        .heroPanelBg {
          background:
            radial-gradient(1200px 600px at 20% 20%, rgba(16,185,129,0.22), transparent 55%),
            radial-gradient(900px 500px at 80% 30%, rgba(59,130,246,0.20), transparent 60%),
            radial-gradient(900px 600px at 30% 90%, rgba(239,68,68,0.16), transparent 55%),
            linear-gradient(180deg, rgba(10,14,24,0.92), rgba(7,10,18,0.92));
        }
      `}</style>

      <div className="rounded-[28px] overflow-hidden border border-white/10 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
        <div className={`relative min-h-[240px] sm:min-h-[280px] md:min-h-[320px] ${active.bg ? "" : "heroPanelBg"}`}>
          <div className="relative z-10 p-6 sm:p-8 md:p-10">
            <div className="flex items-center gap-3">
              <div className="neonTag px-3 py-1 rounded-full bg-white/10 border border-white/10">{active.tag}</div>
              <div className="flex items-center gap-2 ml-auto">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlideIdx(i)}
                    className={`h-2.5 rounded-full transition-all ${i === slideIdx ? "w-10 bg-white/90" : "w-6 bg-white/25 hover:bg-white/35"}`}
                    aria-label={`Slide ${i + 1}`}
                    type="button"
                  />
                ))}
              </div>
            </div>

            <div className="mt-5 sm:mt-6 max-w-[780px]">
              <div className="neonTitle neonCycle text-[30px] sm:text-[42px] md:text-[56px]">{active.title}</div>
              <div className="mt-3 text-white/80 max-w-[64ch] text-sm sm:text-base">{active.subtitle}</div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="text-white font-semibold text-lg">Request Withdrawal</div>
            <div className="text-white/60 text-sm mt-1">Withdraw earnings to your preferred payment method.</div>

            {(err || msg) && (
              <div className={`mt-4 rounded-xl border p-3 text-sm ${err ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
                {err || msg}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <div className="text-xs text-white/60 mb-1">Withdrawal Amount (KSH)</div>
                <input
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="e.g. 500"
                  inputMode="numeric"
                />
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Payment Method</div>
                <select
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                >
                  <option value="M-Pesa">M-Pesa</option>
                  <option value="Airtel Money">Airtel Money</option>
                </select>
              </div>

              <div>
                <div className="text-xs text-white/60 mb-1">Phone Number</div>
                <input
                  className="w-full rounded-xl bg-black/30 border border-white/10 px-4 py-3 text-white outline-none focus:border-emerald-400/50"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 07XXXXXXXX"
                  inputMode="tel"
                />
              </div>
            </div>

            <div className="mt-4 text-xs text-white/50">Tip: double-check your phone number before submitting.</div>

            <div className="mt-5 flex flex-col sm:flex-row gap-3 sm:items-center">
              <button
                type="button"
                onClick={submitWithdraw}
                disabled={!canSubmit}
                className={`w-full sm:w-auto rounded-xl px-5 py-3 font-semibold transition ${
                  canSubmit ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-white/10 text-white/40 cursor-not-allowed"
                }`}
              >
                {loading ? "Submitting..." : "Submit Withdrawal"}
              </button>

              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                className="w-full sm:w-auto rounded-xl px-5 py-3 font-semibold bg-white/10 hover:bg-white/15 text-white"
              >
                {loadingHistory ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-white font-semibold">Withdrawal History</div>
                <div className="text-white/55 text-xs mt-1">Most recent requests</div>
              </div>
              <button
                type="button"
                onClick={loadHistory}
                disabled={loadingHistory}
                className="rounded-xl px-4 py-2 font-semibold bg-white/10 hover:bg-white/15 text-white"
              >
                {loadingHistory ? "..." : "Refresh"}
              </button>
            </div>

            <div className="mt-4 overflow-auto rounded-xl border border-white/10">
              <table className="min-w-full text-sm">
                <thead className="bg-white/5 text-white/70">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">Date</th>
                    <th className="text-left px-3 py-2 font-semibold">Ref</th>
                    <th className="text-right px-3 py-2 font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="text-white/75">
                  {history.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-white/50" colSpan={3}>
                        No withdrawals found yet.
                      </td>
                    </tr>
                  ) : (
                    history.slice(0, 12).map((r) => (
                      <tr key={r.id} className="border-t border-white/10">
                        <td className="px-3 py-2 whitespace-nowrap">{String(r.created_at || "").slice(0, 19).replace("T", " ")}</td>
                        <td className="px-3 py-2">{r.receipt_ref || "-"}</td>
                        <td className="px-3 py-2 text-right">KSH {fmtKsh(Number(r.amount_ksh || 0))}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 text-xs text-white/45">
              If history or submitting fails, your server route naming differs—this page tries multiple common endpoints.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
