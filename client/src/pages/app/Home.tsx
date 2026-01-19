import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { useNavigate } from "react-router-dom";

type Me = {
  id: number;
  username: string;
  email: string;
  full_name: string;
  phone: string;
  payment_number: string;
  referral_code: string;
  balance_ksh: number;
  bonus_ksh: number;
};

type TaskRow = {
  id: number;
  type?: string;
  category?: string;
  title: string;
  prompt?: string;
  media_url?: string | null;
  reward_ksh: number;
  completed?: number | boolean;
};

type TasksResp =
  | TaskRow[]
  | { day_key: string; remaining: number; balance_ksh: number; tasks: TaskRow[] };

function safeNumber(n: any, fallback = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function normalizeTasks(resp: TasksResp): { day_key: string; remaining: number; balance_ksh?: number; tasks: TaskRow[] } {
  if (Array.isArray(resp)) {
    const completed = resp.filter((t) => !!t.completed).length;
    return { day_key: "-", remaining: Math.max(0, 5 - completed), tasks: resp };
  }
  return {
    day_key: resp.day_key || "-",
    remaining: safeNumber(resp.remaining, 0),
    balance_ksh: resp.balance_ksh,
    tasks: Array.isArray(resp.tasks) ? resp.tasks : [],
  };
}

export default function Home() {
  const nav = useNavigate();

  const [me, setMe] = useState<Me | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [dayKey, setDayKey] = useState<string>("-");
  const [remaining, setRemaining] = useState<number>(0);

  const [err, setErr] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);

  const slides = useMemo(
    () => [
      {
        title: "Instant Withdrawals",
        subtitle: "Fast processing once submitted.",
        img: "https://images.unsplash.com/photo-1565372918674-998f2f9e45f9?auto=format&fit=crop&w=1600&q=80",
      },
      {
        title: "Simple Tasks",
        subtitle: "Earn by completing quick transcription tasks.",
        img: "https://images.unsplash.com/photo-1516321497487-e288fb19713f?auto=format&fit=crop&w=1600&q=80",
      },
      {
        title: "Refer & Earn 100 KSH",
        subtitle: "Invite friends and grow your bonus.",
        img: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&w=1600&q=80",
      },
      {
        title: "Work Anytime, Anywhere",
        subtitle: "Mobile-friendly dashboard and tasks.",
        img: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1600&q=80",
      },
    ],
    []
  );

  const [slideIdx, setSlideIdx] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setSlideIdx((i) => (i + 1) % slides.length), 4500);
    return () => window.clearInterval(t);
  }, [slides.length]);

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const m = await api<Me>("/me");
      setMe(m);

      const tr = await api<TasksResp>("/tasks");
      const norm = normalizeTasks(tr);
      setDayKey(norm.day_key);
      setRemaining(norm.remaining);
      setTasks(norm.tasks);

      // keep a cached balance for header widgets if any use localStorage
      localStorage.setItem("balance_ksh", String(safeNumber(m.balance_ksh, 0)));
      if (typeof norm.balance_ksh !== "undefined") {
        localStorage.setItem("balance_ksh", String(safeNumber(norm.balance_ksh, 0)));
      }
    } catch (e: any) {
      setErr(e?.message || "Failed to load dashboard. Please log in again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = window.setInterval(load, 60000);
    return () => window.clearInterval(t);
  }, []);

  const active = slides[slideIdx];

  const preview = useMemo(() => {
    const pending = tasks.filter((t) => !t.completed);
    return pending.slice(0, 3);
  }, [tasks]);

  return (
    <div className="px-5 py-6">
      <div className="rounded-3xl overflow-hidden border border-white/10 bg-white/5">
        {/* HERO SLIDER */}
        <div
          className="relative h-[260px] sm:h-[320px] bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${active.img})`,
          }}
        >
          <div className="absolute inset-0 p-6 sm:p-8 flex flex-col justify-end">
            <div className="text-white text-3xl sm:text-4xl font-extrabold">{active.title}</div>
            <div className="text-white/70 mt-2 text-sm sm:text-base max-w-[560px]">{active.subtitle}</div>

            <div className="mt-5 flex gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSlideIdx(i)}
                  aria-label={`Slide ${i + 1}`}
                  className={`h-2.5 rounded-full transition-all ${
                    i === slideIdx ? "w-10 bg-white/80" : "w-2.5 bg-white/25 hover:bg-white/40"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-5 sm:p-6">
          {err && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-200 text-sm">
              {err}
              <div className="mt-2 text-red-200/80">
                If you see this after login, your token may be missing/expired. Log out and log in again.
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-white/60">Loading dashboard…</div>
          ) : (
            <>
              {/* DASHBOARD CARDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-white/60 text-xs">Profile</div>
                  <div className="text-white font-extrabold text-lg mt-1">{me?.full_name || me?.username || "—"}</div>
                  <div className="text-white/60 text-sm mt-1">{me?.email || ""}</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-white/60 text-xs">Account Balance</div>
                  <div className="text-white font-extrabold text-2xl mt-1">KSH {safeNumber(me?.balance_ksh, 0)}</div>
                  <div className="text-white/50 text-xs mt-1">Earn from tasks and withdrawals.</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-white/60 text-xs">Bonus Wallet</div>
                  <div className="text-white font-extrabold text-2xl mt-1">KSH {safeNumber(me?.bonus_ksh, 0)}</div>
                  <div className="text-white/50 text-xs mt-1">Redeemable once it reaches KSH 1000.</div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-white/60 text-xs">Today</div>
                  <div className="text-white font-extrabold text-lg mt-1">Day: {dayKey}</div>
                  <div className="text-white/60 text-sm mt-1">Remaining tasks: {remaining}</div>
                </div>
              </div>

              {/* QUICK LINKS */}
              <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => nav("/app/tasks")}
                  className="text-left rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition"
                >
                  <div className="text-white font-extrabold text-lg">Tasks</div>
                  <div className="text-white/60 text-sm mt-1">Complete tasks to earn daily rewards.</div>
                </button>

                <button
                  onClick={() => nav("/app/withdraw")}
                  className="text-left rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition"
                >
                  <div className="text-white font-extrabold text-lg">Withdraw</div>
                  <div className="text-white/60 text-sm mt-1">Request payouts to M-Pesa / Airtel.</div>
                </button>

                <button
                  onClick={() => nav("/app/account")}
                  className="text-left rounded-2xl border border-white/10 bg-white/5 p-5 hover:bg-white/10 transition"
                >
                  <div className="text-white font-extrabold text-lg">Account Center</div>
                  <div className="text-white/60 text-sm mt-1">Update profile, password, referrals.</div>
                </button>
              </div>

              {/* TODAY TASKS PREVIEW */}
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-white font-extrabold text-lg">Today’s Tasks</div>
                    <div className="text-white/60 text-sm mt-1">
                      Preview of pending tasks. You can do a maximum of 5 per day.
                    </div>
                  </div>
                  <button
                    onClick={() => nav("/app/tasks")}
                    className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500"
                  >
                    Open Tasks
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {preview.length === 0 ? (
                    <div className="text-white/60">No pending tasks right now.</div>
                  ) : (
                    preview.map((t) => (
                      <div key={t.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="text-white font-bold">{t.title}</div>
                        <div className="text-white/55 text-xs mt-1">
                          Reward: <span className="text-white font-semibold">KSH {t.reward_ksh}</span>
                          {t.type ? <> • {t.type}</> : null}
                        </div>
                        <div className="mt-2 text-white/70 text-sm line-clamp-3">{t.prompt || ""}</div>
                        <div className="mt-3">
                          <button
                            onClick={() => nav("/app/tasks")}
                            className="px-3 py-2 rounded-xl bg-white/10 text-white/80 font-semibold hover:bg-white/15"
                          >
                            View & Submit
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
