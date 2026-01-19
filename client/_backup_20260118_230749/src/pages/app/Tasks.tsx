import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../lib/api";

type Task = {
  id: number;
  title: string;
  description: string;
  category: string;
  reward_ksh: number;
  task_type: string;
  source_text: string;
  difficulty: number;
  completed: boolean;
  media_kind: "text" | "audio" | "video" | "image";
  media_url: string;
  media_thumb: string;
};

type TasksResponse = {
  day: string;
  completedToday: number;
  remainingToday: number;
  tasks: Task[];
};

export default function Tasks() {
  const [data, setData] = useState<TasksResponse | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const timer = useRef<number | null>(null);

  function flash(type: "ok" | "err", text: string) {
    if (timer.current) window.clearTimeout(timer.current);
    if (type === "ok") { setMsg(text); setErr(""); }
    else { setErr(text); setMsg(""); }
    timer.current = window.setTimeout(() => { setMsg(""); setErr(""); }, 4200);
  }

  async function load() {
    setErr("");
    try {
      const r = await api<TasksResponse>("/daily/tasks");
      setData(r);
      const next: Record<number, string> = {};
      for (const t of r.tasks) next[t.id] = inputs[t.id] || "";
      setInputs(next);
    } catch (e: any) {
      setErr(e.message || "Failed to load tasks");
    }
  }

  useEffect(() => {
    load();
    const i = window.setInterval(load, 60000);
    return () => window.clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const progress = useMemo(() => {
    const done = data?.completedToday || 0;
    return Math.min(100, Math.round((done / 5) * 100));
  }, [data?.completedToday]);

  const untilMidnight = useMemo(() => {
    const now = new Date();
    const utc = now.getTime() + now.getTimezoneOffset() * 60000;
    const nairobi = new Date(utc + 3 * 3600000);
    const mid = new Date(nairobi);
    mid.setHours(24, 0, 0, 0);
    const diff = Math.max(0, mid.getTime() - nairobi.getTime());
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return `${h}h ${m}m`;
  }, [data?.day, data?.completedToday]);

  async function complete(t: Task) {
    if (!data) return;
    if (t.completed) return;
    if (data.remainingToday <= 0) {
      flash("err", "Daily limit reached (5/5). Come back after midnight.");
      return;
    }
    const transcription = (inputs[t.id] || "").trim();
    if (!transcription) {
      flash("err", "Type the transcription first.");
      return;
    }

    setBusyId(t.id);
    try {
      const r = await api<{ ok: true; balance_ksh: number; completedToday: number; remainingToday: number }>(
        `/daily/tasks/${t.id}/complete`,
        { method: "POST", body: { transcription } }
      );

      flash("ok", `Task completed! +KSH ${t.reward_ksh}`);
      setData({
        ...data,
        completedToday: r.completedToday,
        remainingToday: r.remainingToday,
        tasks: data.tasks.map(x => x.id === t.id ? { ...x, completed: true } : x),
      });
    } catch (e: any) {
      flash("err", e.message || "Completion failed");
    } finally {
      setBusyId(null);
    }
  }

  function MediaBlock(t: Task) {
    if (t.media_kind === "video" && t.media_url) {
      return (
        <video className="w-full rounded-xl border border-white/10 bg-black/30" controls playsInline poster={t.media_thumb || undefined}>
          <source src={t.media_url} />
        </video>
      );
    }
    if (t.media_kind === "audio" && t.media_url) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-white/60 text-xs mb-2">Listen, then transcribe exactly:</div>
          <audio className="w-full" controls>
            <source src={t.media_url} />
          </audio>
          {t.media_thumb ? <img src={t.media_thumb} className="mt-3 w-full rounded-lg border border-white/10" alt="" /> : null}
        </div>
      );
    }
    if (t.media_kind === "image" && t.media_url) {
      return (
        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-white/60 text-xs mb-2">Transcribe the text shown in the image:</div>
          <img src={t.media_url} className="w-full rounded-lg border border-white/10" alt="task" />
        </div>
      );
    }
    // default text
    return (
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="text-white/60 text-xs mb-2">Transcribe this exactly:</div>
        <div className="text-white text-sm leading-relaxed whitespace-pre-wrap">{t.source_text}</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Transcription Tasks</h1>
          <div className="text-white/60 text-sm mt-1">
            Max <b className="text-white">5</b> tasks/day. Resets at midnight (Nairobi).{" "}
            <span className="text-emerald-200">Next reset in {untilMidnight}.</span>
          </div>
        </div>

        {data && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 min-w-[260px]">
            <div className="text-white/70 text-xs">Today ({data.day})</div>
            <div className="mt-1 text-white text-sm flex justify-between">
              <span>Completed</span><b>{data.completedToday}/5</b>
            </div>
            <div className="mt-1 text-white text-sm flex justify-between">
              <span>Remaining</span><b>{data.remainingToday}</b>
            </div>
            <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
              <div className="h-2 bg-emerald-500" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {(msg || err) && (
        <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${err ? "border-red-500/30 bg-red-500/10 text-red-100" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"}`}>
          {err || msg}
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(data?.tasks || []).map((t) => (
          <div key={t.id} className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-white font-semibold">{t.title}</div>
                <div className="text-white/60 text-sm">{t.description}</div>
              </div>
              <div className="text-right">
                <div className="text-emerald-200 text-sm font-semibold">+KSH {t.reward_ksh}</div>
                <div className="text-white/50 text-xs">
                  {t.media_kind !== "text" ? `${t.media_kind.toUpperCase()} • ` : ""}Difficulty {t.difficulty}
                </div>
              </div>
            </div>

            <div className="mt-4">{MediaBlock(t)}</div>

            <div className="mt-4">
              <div className="text-white/60 text-xs mb-1">Your transcription</div>
              <textarea
                className="w-full rounded-xl bg-black/20 border border-white/10 px-3 py-2 text-white outline-none focus:border-emerald-400/50 min-h-[90px]"
                value={inputs[t.id] || ""}
                onChange={(e) => setInputs({ ...inputs, [t.id]: e.target.value })}
                placeholder="Type here..."
                disabled={t.completed}
              />
            </div>

            <div className="mt-4 flex items-center justify-between">
              {t.completed ? (
                <div className="text-emerald-200 text-sm font-semibold">Completed ✓</div>
              ) : (
                <div className="text-white/50 text-xs">Tip: punctuation & spacing matter.</div>
              )}

              <button
                onClick={() => complete(t)}
                disabled={t.completed || busyId === t.id}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${t.completed ? "bg-white/10 text-white/50" : "bg-emerald-600 hover:bg-emerald-500 text-white"} disabled:opacity-60`}
              >
                {busyId === t.id ? "Submitting..." : t.completed ? "Done" : "Submit"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {!data && !err && <div className="mt-8 text-white/60">Loading tasks…</div>}
    </div>
  );
}
