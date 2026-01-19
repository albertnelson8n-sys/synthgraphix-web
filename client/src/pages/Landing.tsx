import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Slide = { image: string };

function useAutoAdvance(length: number, ms: number, enabled = true) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!enabled || length <= 1) return;
    const id = window.setInterval(() => {
      setActive((v) => (v + 1) % length);
    }, ms);
    return () => window.clearInterval(id);
  }, [enabled, length, ms]);

  const goTo = (i: number) => setActive(Math.max(0, Math.min(length - 1, i)));
  return { active, goTo };
}

function Arrow3D() {
  return (
    <svg width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="a3d" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#22c55e" />
          <stop offset="0.55" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
        <filter id="a3dShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow
            dx="0"
            dy="6"
            stdDeviation="6"
            floodColor="#000"
            floodOpacity="0.55"
          />
        </filter>
      </defs>

      <g filter="url(#a3dShadow)">
        <path
          d="M14 44 L14 20 C14 17 16 15 19 15 L43 15"
          fill="none"
          stroke="url(#a3d)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path d="M43 15 L35 13 L39 22 Z" fill="url(#a3d)" opacity="0.95" />
        <path
          d="M43 15 L30 28"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

function Title3D({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative select-none text-center">
      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-[2px] translate-y-[3px] opacity-35 blur-[1.2px]"
        style={{ color: "rgba(0,0,0,0.75)" }}
      >
        <div className="text-[24px] sm:text-[28px] font-black leading-tight">
          {children}
        </div>
      </div>

      <div
        className="relative text-[24px] sm:text-[28px] font-black leading-tight"
        style={{
          background:
            "linear-gradient(90deg,#ffffff,#e5e7eb,#ffffff,#d1d5db,#ffffff)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          textShadow:
            "0 1px 0 rgba(255,255,255,0.25), 0 10px 26px rgba(0,0,0,0.45)",
          letterSpacing: "0.01em",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function NeonGraffitiWord({ text }: { text: string }) {
  return (
    <div className="relative inline-block select-none">
      <div
        aria-hidden="true"
        className="absolute inset-0 blur-[10px] opacity-40"
        style={{
          background:
            "linear-gradient(90deg, rgba(34,197,94,0.75), rgba(96,165,250,0.75), rgba(167,139,250,0.75), rgba(245,158,11,0.6))",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          transform: "skewX(-8deg) rotate(-1deg)",
        }}
      >
        <div className="text-[40px] sm:text-[52px] font-black leading-none">
          {text}
        </div>
      </div>

      <div
        aria-hidden="true"
        className="absolute inset-0 translate-x-[2px] translate-y-[3px] opacity-22 blur-[2.2px]"
        style={{
          color: "rgba(0,0,0,0.75)",
          transform: "skewX(-8deg) rotate(-1deg)",
        }}
      >
        <div className="text-[40px] sm:text-[52px] font-black leading-none">
          {text}
        </div>
      </div>

      <div
        className="relative font-black tracking-tight"
        style={{
          background:
            "linear-gradient(90deg, #ff5a3c, #ffd166, #22c55e, #60a5fa, #a78bfa)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          textShadow:
            "0 0 10px rgba(255,255,255,0.12), 0 0 26px rgba(59,130,246,0.18), 0 0 22px rgba(34,197,94,0.18)",
          transform: "skewX(-8deg) rotate(-1deg)",
        }}
      >
        <div className="text-[40px] sm:text-[52px] leading-none">{text}</div>
      </div>
    </div>
  );
}

function MiniHeroSlider({ slides, active }: { slides: Slide[]; active: number }) {
  return (
    <div className="relative h-[140px] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      {slides.map((sl, i) => (
        <div
          key={sl.image}
          className={
            "absolute inset-0 transition-opacity duration-700 " +
            (i === active ? "opacity-100" : "opacity-0")
          }
          style={{
            backgroundImage: "url(" + sl.image + ")",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
      ))}
      <div className="absolute inset-0 bg-black/40" />
      <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-1.5">
        {slides.map((_, i) => (
          <span
            key={i}
            className={
              "h-1.5 rounded-full transition-all " +
              (i === active ? "w-5 bg-white/80" : "w-1.5 bg-white/35")
            }
          />
        ))}
      </div>
    </div>
  );
}

function Starfield() {
  // deterministic pseudo-random so it doesn't jump every refresh
  const stars = useMemo(() => {
    let seed = 1337;
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    const arr: Array<{
      left: string;
      top: string;
      size: number;
      dur: number;
      delay: number;
      op: number;
    }> = [];
    for (let i = 0; i < 95; i++) {
      const size = 1 + Math.floor(rand() * 2); // 1-2px
      arr.push({
        left: `${Math.floor(rand() * 100)}%`,
        top: `${Math.floor(rand() * 100)}%`,
        size,
        dur: 2.2 + rand() * 2.8,
        delay: rand() * 3.5,
        op: 0.25 + rand() * 0.55,
      });
    }
    return arr;
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0">
      <style>{`
        @keyframes twinkle {
          0%, 100% { transform: scale(1); opacity: var(--op); }
          50% { transform: scale(1.35); opacity: calc(var(--op) + 0.35); }
        }
        @keyframes drift {
          0% { transform: translate3d(0,0,0); }
          100% { transform: translate3d(-1.5%, 1.5%, 0); }
        }
      `}</style>

      {/* subtle drifting layer so it feels alive */}
      <div className="absolute inset-0" style={{ animation: "drift 18s linear infinite" }}>
        {stars.map((s, idx) => (
          <span
            key={idx}
            style={
              {
                left: s.left,
                top: s.top,
                width: `${s.size}px`,
                height: `${s.size}px`,
                ["--op" as any]: s.op,
                animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
                boxShadow: "0 0 10px rgba(255,255,255,0.20)",
              } as React.CSSProperties
            }
            className="absolute rounded-full bg-white"
          />
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();

  // Mini slider inside the small dark box (you can swap these for real photos later)
  const miniSlides: Slide[] = useMemo(
    () => [
      { image: "/hero/slide-1.svg" },
      { image: "/hero/slide-2.svg" },
      { image: "/hero/slide-3.svg" },
    ],
    []
  );

  const mini = useAutoAdvance(miniSlides.length, 3800, true);

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Static background image (no words) + twinkling stars */}
      <div className="absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "url(/bg/space.avif)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 backdrop-blur-[1px]" />
        <Starfield />
      </div>

      {/* Center card */}
      <div className="relative z-10 mx-auto flex min-h-screen max-w-[520px] items-center justify-center px-5 py-10">
        <div className="w-full">
          <div className="mx-auto w-full rounded-[44px] border border-white/10 bg-black/65 shadow-[0_30px_70px_rgba(0,0,0,0.65)] backdrop-blur-xl">
            <div className="p-8">
              {/* Logo area */}
              <div className="flex items-center justify-center">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-600/90 shadow-[0_18px_40px_rgba(16,185,129,0.20)]">
                  <span className="text-xl font-black text-white">S</span>
                </div>
              </div>

              {/* Wordmark */}
              <div className="mt-5 flex justify-center">
                <NeonGraffitiWord text="Synthgraphix" />
              </div>
              <div className="mt-1 text-center text-[11px] tracking-[0.25em] text-emerald-300/70">
                BUSINESS PLATFORM
              </div>

              {/* 3D Arrow */}
              <div className="mt-8 flex justify-center">
                <Arrow3D />
              </div>

              {/* 3D Title */}
              <div className="mt-5">
                <Title3D>Path to Financial Freedom</Title3D>
              </div>

              <div className="mt-2 text-center text-sm text-white/55">
                Unlock new earning potentials today.
              </div>

              {/* Mini slider INSIDE the small box */}
              <div className="mt-8">
                <MiniHeroSlider slides={miniSlides} active={mini.active} />
              </div>

              <div className="h-6" />
            </div>

            {/* Get Started area (kept bright) */}
            <div className="px-8 pb-8">
              <button
                onClick={() => navigate("/login")}
                className="w-full rounded-2xl bg-white py-4 text-center font-semibold text-slate-900 shadow-[0_16px_40px_rgba(255,255,255,0.22)] transition-transform active:scale-[0.99]"
              >
                Get Started →
              </button>
            </div>
          </div>

          <div className="h-6" />
        </div>
      </div>
    </div>
  );
}
