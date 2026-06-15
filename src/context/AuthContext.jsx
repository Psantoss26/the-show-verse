// /src/context/AuthContext.jsx
"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { fetchTmdbAccountClient } from "@/lib/api/tmdb";

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = "tmdb_session";
const LEGACY_SESSION_STORAGE_KEY = "tmdb_session_id";
const ACCOUNT_STORAGE_KEY = "tmdb_account";

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

      try {
        const storedSession =
          window.localStorage.getItem(SESSION_STORAGE_KEY) ||
          window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY);
        const storedAccount = window.localStorage.getItem(ACCOUNT_STORAGE_KEY);

        if (storedSession) {
          window.localStorage.setItem(SESSION_STORAGE_KEY, storedSession);
          window.localStorage.setItem(LEGACY_SESSION_STORAGE_KEY, storedSession);
          if (!cancelled) setSession(storedSession);
          // Asegurar que la cookie tiene el nombre correcto (tmdb_session_id)
          document.cookie = `tmdb_session_id=${encodeURIComponent(
            storedSession,
          )}; path=/; max-age=31536000`;
          // Limpiar cookie vieja si existe
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
        } else if (storedSession) {
          try {
            let accountFromCookie;
            try {
              accountFromCookie = await fetchTmdbAccountClient(storedSession);
            } catch (directError) {
              console.warn(
                "No se pudo refrescar la cuenta TMDb directo; usando API local",
                directError,
              );
              const res = await fetch(
                `/api/tmdb/auth/account?session_id=${encodeURIComponent(
                  storedSession,
                )}`,
                { cache: "no-store" },
              );
              if (res.ok) accountFromCookie = await res.json();
            }

            if (accountFromCookie?.id) {
              window.localStorage.setItem(
                ACCOUNT_STORAGE_KEY,
                JSON.stringify(accountFromCookie),
              );
              if (!cancelled) setAccount(accountFromCookie);
            }
          } catch (e) {
            console.warn(
              "No se pudo refrescar la cuenta TMDb; se mantiene la sesión local",
              e,
            );
          }
        }
      } catch (e) {
        console.warn("Error leyendo sesión TMDb desde localStorage", e);
        if (!cancelled) {
          const fallbackSession =
            typeof window !== "undefined"
              ? window.localStorage.getItem(SESSION_STORAGE_KEY) ||
                window.localStorage.getItem(LEGACY_SESSION_STORAGE_KEY)
              : null;
          if (fallbackSession) {
            setSession(fallbackSession);
          } else {
            setSession(null);
          }
          setAccount(null);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    hydrateAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = ({ session_id, account }) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SESSION_STORAGE_KEY, session_id);
      window.localStorage.setItem(LEGACY_SESSION_STORAGE_KEY, session_id);
      window.localStorage.setItem(ACCOUNT_STORAGE_KEY, JSON.stringify(account));
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
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_SESSION_STORAGE_KEY);
      window.localStorage.removeItem(ACCOUNT_STORAGE_KEY);
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
