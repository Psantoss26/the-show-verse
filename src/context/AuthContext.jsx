// /src/context/AuthContext.jsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);
const LEGACY_STORAGE_KEYS = ["tmdb_session", "tmdb_session_id", "tmdb_account"];
const COMPAT_SESSION_VALUE = "showverse";

function cleanLegacyStorage() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

function toCompatAccount(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    name: user.displayName || user.username,
    displayName: user.displayName || user.username,
    avatarUrl: user.avatarUrl || null,
    email: user.email || null,
    plan: user.plan || "free",
    provider: "showverse",
  };
}

async function readJsonResponse(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json?.error || json?.message || "Auth request failed");
    error.status = response.status;
    error.payload = json;
    throw error;
  }
  return json;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const applyUser = useCallback((nextUser) => {
    const normalized = nextUser || null;
    setUser(normalized);
    return normalized;
  }, []);

  const refreshMe = useCallback(async () => {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    const json = await res.json().catch(() => ({}));
    const nextUser = json?.authenticated ? json.user || null : null;
    applyUser(nextUser);
    setHydrated(true);
    return nextUser;
  }, [applyUser]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuth() {
      cleanLegacyStorage();
      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        applyUser(json?.authenticated ? json.user || null : null);
      } catch (e) {
        console.warn("No se pudo hidratar la sesión propia", e);
        if (!cancelled) applyUser(null);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrateAuth();
    return () => {
      cancelled = true;
    };
  }, [applyUser]);

  const login = useCallback(
    async (credentials) => {
      cleanLegacyStorage();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(credentials || {}),
      });
      const json = await readJsonResponse(res);
      setHydrated(true);
      return applyUser(json.user || null);
    },
    [applyUser],
  );

  const register = useCallback(
    async (payload) => {
      cleanLegacyStorage();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify(payload || {}),
      });
      const json = await readJsonResponse(res);
      setHydrated(true);
      return applyUser(json.user || null);
    },
    [applyUser],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
      });
    } catch (e) {
      console.warn("No se pudo cerrar la sesión en backend", e);
    } finally {
      cleanLegacyStorage();
      applyUser(null);
      setHydrated(true);
    }
  }, [applyUser]);

  const account = useMemo(() => toCompatAccount(user), [user]);
  const authenticated = !!user;
  const session = authenticated ? COMPAT_SESSION_VALUE : null;

  const value = useMemo(
    () => ({
      user,
      account,
      session,
      authenticated,
      hydrated,
      login,
      register,
      logout,
      refreshMe,
    }),
    [account, authenticated, hydrated, login, logout, refreshMe, register, session, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    console.warn("useAuth se ha usado fuera de <AuthProvider>");
    return {
      user: null,
      session: null,
      account: null,
      authenticated: false,
      hydrated: true,
      login: async () => null,
      register: async () => null,
      logout: async () => {},
      refreshMe: async () => null,
    };
  }
  return ctx;
};
