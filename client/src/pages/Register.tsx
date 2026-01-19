import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../state/auth";
import { Glass, Input, Button } from "../components/ui";

export default function Register() {
  const nav = useNavigate();
  const { setToken } = useAuth();
  const [params] = useSearchParams();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [referralCode, setReferralCode] = useState(params.get("ref") || "");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await api<{ token: string }>("/auth/register", {
        method: "POST",
        body: { username, email, password, referralCode },
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
            "linear-gradient(rgba(0,0,0,0.60),rgba(0,0,0,0.60)), url(https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1600&q=80)",
        }}
      />

      <div className="absolute top-14 left-0 right-0 text-center px-4">
        <div className="text-white text-3xl sm:text-4xl font-extrabold">Join the Platform</div>
        <div className="mt-2 text-emerald-300/80 text-[11px] tracking-[0.25em]">
          START YOUR JOURNEY TO FINANCIAL FREEDOM.
        </div>
      </div>

      <Glass className="relative z-10 w-full max-w-[450px] p-6 sm:p-7">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-600 flex items-center justify-center font-black text-white">
            S
          </div>
          <div>
            <div className="text-white font-bold text-lg">Sign Up</div>
            <div className="text-white/55 text-xs">Create your profile</div>
          </div>
        </div>

        <div className="my-5 h-px bg-white/10" />

        <form onSubmit={onSubmit} className="space-y-4">
          <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <Input placeholder="Referral Code (Optional)" value={referralCode} onChange={(e) => setReferralCode(e.target.value)} />
          {err && <div className="text-sm text-red-300">{err}</div>}
          <Button disabled={loading}>{loading ? "Creating..." : "Create Account →"}</Button>
        </form>

        <div className="mt-5 text-center text-sm text-white/60">
          ALREADY A MEMBER?{" "}
          <Link to="/login" className="text-white font-semibold hover:underline">
            LOG IN HERE
          </Link>
        </div>
      </Glass>
    </div>
  );
}
