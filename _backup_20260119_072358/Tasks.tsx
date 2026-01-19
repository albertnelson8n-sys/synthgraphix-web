import { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";

type Task = {
  id: number;
  type: string;
  category: string;
  title: string;
  description: string;
  prompt: string;
  media_url: string | null;
  reward_ksh: number;
  complexity: number;
  completed: boolean;
  answer_text: string;
};

type TasksPayload = {
  day_key: string;
  remaining: number;
  balance_ksh: number;
  tasks: Task[];
};

type HistoryRow = {
  id: number;
  created_at: string;
  reward_ksh: number;
  answer_text: string;
  title: string;
  type: string;
  category: string;
};

function mediaKind(t: Task) {
  const x = (t.type || t.category || "").toLowerCase();
  const u = (t.media_url || "").toLowerCase();
  if (x.includes("audio") || /\.(mp3|ogg|wav|m4a)(\?.*)?$/.test(u)) return "audio";
  if (x.includes("video") || /\.(mp4|webm|mov)(\?.*)?$/.test(u)) return "video";
  if (x.includes("image") || /\.(png|jpg|jpeg|gif|webp)(\?.*)?$/.test(u) || u.includes("wikimedia")) return "image";
  return "unknown";
}

function setCachedBalance(balance_ksh: number) {
  try {
    const prev = JSON.parse(localStorage.getItem("me_cache") || "{}");
    const next = { ...prev, balance_ksh };
    localStorage.setItem("me_cache", JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("synth:me", { detail: next }));
  } catch {}
}

export default function Tasks() {
  const [data, setData] = useState<TasksPayload | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const tasksUnique = useMemo(() => {
    // extra safety: if API ever returns duplicates, hide them by type
    const seen = new Set<string>();
    const out: Task[] = [];
    for (const t of data?.tasks || []) {
      const k = (t.type || t.category || "").toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out;
  }, [data?.tasks]);

  async function load() {
    setErr("");
    try {
      const d = await api<TasksPayload>("/tasks");
      setData(d);
      setCachedBalance(d.balance_ksh || 0);
      const h = await api<HistoryRow[]>("/tasks/history");
      setHistory(h || []);
      const next: Record<number, string> = {};
      for (const t of d.tasks) next[t.id] = inputs[t.id] ?? (t.answer_text || "");
      setInputs((p) => ({ ...next, ...p }));
    } catch (e: any) {
      setErr(e.message || "Failed to load tasks");
    }
  }

  useEffect(() => {
    load();
    // refresh after midnight reset if user stays open
    const t = window.setInterval(load, 60000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function flashOk(s: string) {
    setMsg(s);
    setErr("");
    window.setTimeout(() => setMsg(""), 3500);
  }
  function flashErr(s: string) {
    setErr(s);
    setMsg("");
  }

  async function submitTask(task: Task) {
    const answer_text = (inputs[task.id] || "").trim();
    if (!answer_text) return flashErr("Please type your answer/transcription first.");
    setBusy((p) => ({ ...p, [task.id]: true }));
    setErr("");
    setMsg("");
    try {
      const r = await api<{ ok: true; balance_ksh: number }>(`/tasks/${task.id}/complete`, {
        method: "POST",
        body: { answer_text },
      });
      setCachedBalance(r.balance_ksh || 0);
      flashOk(`Task submitted. +KSH ${task.reward_ksh}`);
      await load();
    } catch (e: any) {
      flashErr(e.message || "Submit failed");
    } finally {
      setBusy((p) => ({ ...p, [task.id]: false }));
    }
  }

  return (
    <div className="px-6 py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-2xl font-extrabold text-white">Tasks Center</div>
          <div className="text-white/60 text-sm mt-1">
            Up to <span className="font-semibold">5 tasks/day</span>. Resets at midnight (Nairobi). No duplicate task types per day.
          </div>
          {err && <div className="mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">{err}</div>}
          {msg && <div className="mt-3 text-sm text-emerald-200 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">{msg}</div>}
        </div>

        <div className="flex gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-white/60 text-xs">Today ({data?.day_key || "…"})</div>
            <div className="text-white font-extrabold text-lg">Remaining: {data?.remaining ?? "…"}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <div className="text-white/60 text-xs">Balance</div>
            <div className="text-white font-extrabold text-lg">KSH {Number(data?.balance_ksh || 0)}</div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {tasksUnique.map((t) => {
          const kind = mediaKind(t);
          const disabled = t.completed || !!busy[t.id];
          return (
            <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-white font-bold text-sm">{t.title}</div>
                  <div className="text-white/60 text-xs mt-1">
                    {t.type} • Reward: <span className="font-semibold text-white">KSH {t.reward_ksh}</span>
                  </div>
                  <div className="text-white/60 text-xs mt-2">{t.description}</div>
                </div>
                <div className={"text-xs px-2 py-1 rounded-full " + (t.completed ? "bg-emerald-600/20 text-emerald-200" : "bg-white/10 text-white/70")}>
                  {t.completed ? "Completed" : "Pending"}
                </div>
              </div>

              <div className="mt-3 rounded-xl overflow-hidden border border-white/10 bg-black/20">
                {kind === "image" && t.media_url && <img src={t.media_url} alt={t.title} className="w-full h-32 object-cover" />}
                {kind === "audio" && t.media_url && (
                  <div className="p-2">
                    <audio controls className="w-full" src={t.media_url} />
                  </div>
                )}
                {kind === "video" && t.media_url && (
                  <video controls className="w-full h-32 object-cover" src={t.media_url} />
                )}
                {kind === "unknown" && (
                  <div className="p-3 text-white/50 text-xs">Media unavailable.</div>
                )}
              </div>

              <div className="mt-3">
                <div className="text-white/60 text-xs mb-1">{t.prompt}</div>
                <textarea
                  className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white text-sm outline-none focus:border-emerald-500/40 min-h-[86px]"
                  placeholder={t.type.includes("caption") ? "Write your caption here…" : "Type your transcription here…"}
                  value={inputs[t.id] || ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [t.id]: e.target.value }))}
                  disabled={t.completed}
                />
              </div>

              <button
                onClick={() => submitTask(t)}
                disabled={disabled}
                className={
                  "mt-3 w-full rounded-xl px-4 py-2 font-semibold text-sm " +
                  (disabled ? "bg-white/10 text-white/40" : "bg-emerald-600 hover:bg-emerald-500 text-white")
                }
              >
                {t.completed ? "Completed" : busy[t.id] ? "Submitting…" : "Submit Task"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="text-white font-extrabold">Task Completion History</div>
        <div className="text-white/60 text-sm mt-1">Your most recent completions (with payout amounts).</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/60">
                <th className="text-left py-2 pr-3">Date</th>
                <th className="text-left py-2 pr-3">Task</th>
                <th className="text-left py-2 pr-3">Type</th>
                <th className="text-left py-2 pr-3">Reward</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td className="py-3 text-white/50" colSpan={4}>
                    No completions yet.
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-t border-white/10">
                    <td className="py-2 pr-3 text-white/70">{h.created_at}</td>
                    <td className="py-2 pr-3 text-white">{h.title}</td>
                    <td className="py-2 pr-3 text-white/70">{h.type}</td>
                    <td className="py-2 pr-3 text-emerald-200 font-semibold">KSH {h.reward_ksh}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
