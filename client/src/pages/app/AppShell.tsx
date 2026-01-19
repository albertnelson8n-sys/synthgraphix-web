import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../state/auth";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  localStorage.setItem("theme", theme);
}

function getTheme(): "light" | "dark" {
  const t = (localStorage.getItem("theme") || "").toLowerCase();
  return t === "dark" ? "dark" : "light";
}

export default function AppShell() {
  const { logout } = useAuth();
  const nav = useNavigate();

  const [balance, setBalance] = useState<number>(0);
  const [username, setUsername] = useState<string>("");
  const [theme, setTheme] = useState<"light" | "dark">(getTheme());

  async function loadMe() {
    const me = await api<any>("/me");
    setBalance(Number(me.balance_ksh || 0));
    setUsername(me.username || "");
  }

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    loadMe().catch(() => {});
  }, []);

  function onLogout() {
    logout();
    nav("/login");
  }

  function toggleTheme() {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* topbar */}
      <div className="bg-white border-b border-slate-200 dark:bg-slate-900 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black">
              S
            </div>
            <div className="leading-tight">
              <div className="font-extrabold tracking-wide">SYNTHGRAPHIX</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Business Platform</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-sm font-semibold
                         dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700"
              title="Toggle theme"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>

            <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm
                            dark:bg-emerald-950/30 dark:border-emerald-800">
              Balance: <b>KSH {balance.toFixed(2)}</b>
            </div>

            <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300">
              Hi, <b>{username}</b>
            </div>

            <button
              onClick={onLogout}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-sm font-semibold
                         dark:bg-slate-800 dark:hover:bg-slate-700 dark:border-slate-700"
            >
              Logout
            </button>
          </div>
        </div>

        {/* nav */}
        <div className="max-w-6xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
          {[
            ["Home", "/app"],
            ["Tasks Center", "/app/tasks"],
            ["Withdrawal", "/app/withdraw"],
            ["Account", "/app/account"],
          ].map(([label, to]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/app"}
              className={({ isActive }) =>
                "px-4 py-2 rounded-xl text-sm font-semibold border transition " +
                (isActive
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-800 dark:hover:bg-slate-800")
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Outlet context={{ refreshBalance: loadMe }} />
      </div>
    </div>
  );
}
