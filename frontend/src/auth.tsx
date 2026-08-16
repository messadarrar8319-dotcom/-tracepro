import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "./api";

type AuthState = {
  loading: boolean;
  user: any | null;
  org: any | null;
  subscription: any | null;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (body: any) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [org, setOrg] = useState<any>(null);
  const [subscription, setSubscription] = useState<any>(null);

  const refresh = useCallback(async () => {
    try {
      const t = await api.readToken();
      if (!t) {
        setUser(null); setOrg(null); setSubscription(null);
        return;
      }
      const me = await api.me();
      setUser(me.user); setOrg(me.organization); setSubscription(me.subscription);
    } catch {
      await api.clearToken();
      setUser(null); setOrg(null); setSubscription(null);
    }
  }, []);

  useEffect(() => { (async () => { await refresh(); setLoading(false); })(); }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    await api.saveToken(r.access_token);
    await refresh();
  };
  const register = async (body: any) => {
    const r = await api.register(body);
    await api.saveToken(r.access_token);
    await refresh();
  };
  const logout = async () => {
    await api.clearToken();
    setUser(null); setOrg(null); setSubscription(null);
  };

  return (
    <AuthContext.Provider value={{ loading, user, org, subscription, refresh, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside provider");
  return ctx;
}
