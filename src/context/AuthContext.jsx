// /src/context/AuthContext.jsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [account, setAccount] = useState(null);
  const [hydrated, setHydrated] = useState(false); // 👈 NUEVO

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuth() {
      if (typeof window === "undefined") {
        setHydrated(true);
        return;
      }

      const storedSession = window.localStorage.getItem("tmdb_session");
      const storedAccount = window.localStorage.getItem("tmdb_account");

      if (storedSession) {
        if (!cancelled) setSession(storedSession);
        document.cookie = `tmdb_session_id=${encodeURIComponent(
          storedSession,
        )}; path=/; max-age=31536000`;
        document.cookie = "tmdb_session=; path=/; max-age=0";
      }

      if (storedAccount) {
        try {
          const parsedAccount = JSON.parse(storedAccount);
          if (!cancelled) setAccount(parsedAccount);
        } catch (e) {
          console.warn("tmdb_account corrupto, se limpia", e);
          window.localStorage.removeItem("tmdb_account");
          if (!cancelled) setAccount(null);
        }
      }

      if (!storedAccount && storedSession && navigator.onLine) {
        await recoverAccount(storedSession);
      }

      if (!cancelled) setHydrated(true);
    }

    async function recoverAccount(sessionId) {
      // Intentar por la ruta servidor primero
      try {
        const res = await fetch("/api/tmdb/account", { cache: "no-store" });
        if (res.ok) {
          const accountFromCookie = await res.json();
          window.localStorage.setItem("tmdb_account", JSON.stringify(accountFromCookie));
          if (!cancelled) setAccount(accountFromCookie);
          return;
        }
      } catch {
        // servidor no disponible
      }

      // Fallback directo a TMDb API
      try {
        const apiKey = process.env.NEXT_PUBLIC_TMDB_API_KEY;
        if (apiKey) {
          const directRes = await fetch(
            `https://api.themoviedb.org/3/account?api_key=${apiKey}&session_id=${encodeURIComponent(sessionId)}`,
          );
          if (directRes.ok) {
            const directAccount = await directRes.json();
            window.localStorage.setItem("tmdb_account", JSON.stringify(directAccount));
            if (!cancelled) setAccount(directAccount);
          }
        }
      } catch {
        // no hay conexión a TMDb
      }
    }

    hydrateAuth();

    // Reintentar recuperar cuenta al volver online si falta
    const onOnline = () => {
      const hasSession = !!(window.localStorage.getItem("tmdb_session"));
      const hasAccount = !!(window.localStorage.getItem("tmdb_account"));
      if (hasSession && !hasAccount) {
        recoverAccount(window.localStorage.getItem("tmdb_session"));
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onOnline);
      }
    };
  }, []);

  const login = ({ session_id, account }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("tmdb_session", session_id);
      window.localStorage.setItem("tmdb_account", JSON.stringify(account));
      document.cookie = `tmdb_session_id=${encodeURIComponent(
        session_id,
      )}; path=/; max-age=31536000`;
    }

    setSession(session_id);
    setAccount(account);
    setHydrated(true); // por si acaso
  };

  const logout = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("tmdb_session");
      window.localStorage.removeItem("tmdb_account");
      document.cookie = "tmdb_session_id=; path=/; max-age=0";
    }

    setSession(null);
    setAccount(null);
    setHydrated(true); // también hemos “terminado de saber” el estado
  };

  return (
    <AuthContext.Provider
      value={{ session, account, login, logout, hydrated }} // 👈 exportamos hydrated
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    console.warn("useAuth se ha usado fuera de <AuthProvider>");
    // devolvemos hydrated: true para no dejar la UI en loading eterno
    return {
      session: null,
      account: null,
      login: () => {},
      logout: () => {},
      hydrated: true,
    };
  }
  return ctx;
};
