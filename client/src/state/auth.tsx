import React, { createContext, useContext, useMemo, useState } from "react";

type AuthCtx = { token: string; setToken: (t: string) => void; logout: () => void; };
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState(localStorage.getItem("token") || "");

  const setToken = (t: string) => { setTokenState(t); localStorage.setItem("token", t); };
  const logout = () => { setTokenState(""); localStorage.removeItem("token"); };

  const value = useMemo(() => ({ token, setToken, logout }), [token]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
