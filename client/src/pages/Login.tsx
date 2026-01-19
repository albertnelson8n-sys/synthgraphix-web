import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { Glass, Input, Button } from "../components/ui";

export default function Login() {
  const nav = useNavigate();
  const { setToken } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await api<{ token: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setToken(res.token);
      nav("/app");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-black px-4">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(rgba(0,0,0,0.60),rgba(0,0,0,0.60)), url(https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1600&q=80)",
        }}
      />

      <div className="absolute top-14 left-0 right-0 text-center px-4">
        <div className="text-white text-3xl sm:text-4xl font-extrabold">Grow Your Network</div>
        <div className="mt-2 text-emerald-300/80 text-[11px] tracking-[0.25em]">
          CONNECT, REFER, AND EARN PASSIVE REWARDS TOGETHER.
        </div>
      </div>

      <Glass className="relative z-10 w-full max-w-[430px] p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-white">
            S
          </div>
          <div>
            <div className="text-white font-bold text-lg">Log in</div>
            <div className="text-white/55 text-xs">Secure access to your account</div>
          </div>
        </div>

        <div className="my-5 h-px bg-white/10" />

        <form onSubmit={onSubmit} className="space-y-4">
          <Input placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {err && <div className="text-sm text-red-300">{err}</div>}
          <Button disabled={loading}>{loading ? "Logging in..." : "Log in →"}</Button>
        </form>

        <div className="mt-5 text-center text-sm text-white/60">
          NO ACCOUNT?{" "}
          <Link to="/register" className="text-white font-semibold hover:underline">
            CREATE ONE
          </Link>
        </div>
      </Glass>
    </div>
  );
}
