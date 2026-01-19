import React from "react";

export function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"rounded-3xl bg-black/55 backdrop-blur-2xl border border-white/10 shadow-[0_25px_80px_rgba(0,0,0,0.55)] " + className}>
      {children}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-xl bg-black/35 border border-white/10 px-4 py-3 text-[14px] text-white placeholder:text-white/25 " +
        "outline-none focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-500/10 " +
        (props.className || "")
      }
    />
  );
}

export function Button({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={
        "w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-600 px-4 py-3 font-semibold transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed " +
        className
      }
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={"rounded-2xl bg-white border border-slate-200 shadow-sm " + className}>{children}</div>;
}

export function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={"inline-flex items-center rounded-full px-3 py-1 text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 " + className}>
      {children}
    </span>
  );
}

export function SoftButton({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={"rounded-xl px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 " + className}
    >
      {children}
    </button>
  );
}
