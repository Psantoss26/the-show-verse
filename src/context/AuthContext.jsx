// /src/context/AuthContext.jsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const AuthContext = createContext(null);
const LEGACY_STORAGE_KEYS = ["tmdb_session", "tmdb_session_id", "tmdb_account"];
const COMPAT_SESSION_VALUE = "showverse";

const DEFAULT_PREFERENCES = {
  defaultView: "grid",
  adultContent: false,
  notificationSettings: {
    weeklySummary: false,
  },
  uiSettings: {
    profileAutoRefresh: true,
    compactProfileCards: false,
    syncTraktActions: false,
  },
};

function mergePreferences(value) {
  return {
    ...DEFAULT_PREFERENCES,
    ...(value || {}),
    notificationSettings: {
      ...DEFAULT_PREFERENCES.notificationSettings,
      ...(value?.notificationSettings || {}),
    },
    uiSettings: {
      ...DEFAULT_PREFERENCES.uiSettings,
      ...(value?.uiSettings || {}),
    },
  };
}

function setCookie(name, value, days = 365) {
  if (typeof window === "undefined") return;
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
  const expires = "; expires=" + date.toUTCString();
  document.cookie = name + "=" + (value || "") + expires + "; path=/; SameSite=Lax; Secure";
}

function cleanLegacyStorage() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_STORAGE_KEYS) {
    window.localStorage.removeItem(key);
  }
}

// Caché del usuario (stale-while-revalidate), igual que las páginas de usuario
// (History/Stats): permite pintar el icono de perfil del navbar al instante sin
// esperar a /api/auth/me, y revalidar en segundo plano.
const AUTH_USER_CACHE_KEY = "showverse:auth:user:v1";
const AUTH_USER_CACHE_HARD_MAX_AGE = 1000 * 60 * 60 * 24 * 7; // 7 días

function readAuthUserCache() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_USER_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.user) return null;
    if (Date.now() - Number(parsed.t || 0) > AUTH_USER_CACHE_HARD_MAX_AGE) {
      window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
      return null;
    }
    return parsed.user;
  } catch {
    return null;
  }
}

function writeAuthUserCache(user) {
  if (typeof window === "undefined") return;
  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_USER_CACHE_KEY);
      return;
    }
    window.localStorage.setItem(
      AUTH_USER_CACHE_KEY,
      JSON.stringify({ t: Date.now(), user }),
    );
  } catch {
    // ignore
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
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loadingPreferences, setLoadingPreferences] = useState(false);

  const applyUser = useCallback((nextUser) => {
    const normalized = nextUser || null;
    setUser(normalized);
    writeAuthUserCache(normalized);
    return normalized;
  }, []);

  const syncPreferenceCookies = useCallback((prefs) => {
    if (prefs?.defaultView) {
      setCookie("showverse_default_view", prefs.defaultView);
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    setLoadingPreferences(true);
    try {
      const res = await fetch("/api/user/preferences", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.preferences) {
        const merged = mergePreferences(json.preferences);
        setPreferences(merged);
        syncPreferenceCookies(merged);
      }
    } catch (err) {
      console.warn("No se pudieron cargar las preferencias", err);
    } finally {
      setLoadingPreferences(false);
    }
  }, [syncPreferenceCookies]);

  const savePreferences = useCallback(async (nextPreferences) => {
    setPreferences(nextPreferences);
    syncPreferenceCookies(nextPreferences);
    try {
      const res = await fetch("/api/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextPreferences),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.preferences) {
        const merged = mergePreferences(json.preferences);
        setPreferences(merged);
        syncPreferenceCookies(merged);
      }
    } catch (err) {
      console.error("Error al guardar preferencias:", err);
    }
  }, [syncPreferenceCookies]);

  const updatePreference = useCallback((patch) => {
    const next = mergePreferences({
      ...preferences,
      ...patch,
    });
    savePreferences(next);
  }, [preferences, savePreferences]);

  const refreshMe = useCallback(async () => {
    const res = await fetch("/api/auth/me", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });
    const json = await res.json().catch(() => ({}));
    const nextUser = json?.authenticated ? json.user || null : null;
    applyUser(nextUser);
    if (nextUser) {
      await loadPreferences();
    }
    setHydrated(true);
    return nextUser;
  }, [applyUser, loadPreferences]);

  useEffect(() => {
    // Sincronizar cookies iniciales desde localStorage/defaults si no hay cookies
    if (typeof window !== "undefined") {
      const viewMatch = document.cookie.match(/showverse_default_view=([^;]+)/);
      if (!viewMatch) {
        setCookie("showverse_default_view", "grid");
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAuth() {
      cleanLegacyStorage();

      // 1) Pintado optimista desde caché: el navbar muestra el perfil al instante
      // sin esperar a la red (igual que History/Stats). Se revalida abajo.
      const cachedUser = readAuthUserCache();
      if (cachedUser) {
        setUser(cachedUser);
        setHydrated(true);
      }

      try {
        const res = await fetch("/api/auth/me", {
          method: "GET",
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        const loggedUser = applyUser(json?.authenticated ? json.user || null : null);
        // 2) Desbloqueamos el navbar/Profile tras UNA sola llamada; las
        // preferencias se cargan en segundo plano (no en la ruta crítica).
        setHydrated(true);
        if (loggedUser) {
          loadPreferences();
        }
      } catch (e) {
        console.warn("No se pudo hidratar la sesión propia", e);
        if (!cancelled && !cachedUser) applyUser(null);
        if (!cancelled) setHydrated(true);
      }
    }

    hydrateAuth();
    return () => {
      cancelled = true;
    };
  }, [applyUser, loadPreferences]);

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
      const loggedUser = applyUser(json.user || null);
      if (loggedUser) {
        await loadPreferences();
      }
      setHydrated(true);
      return loggedUser;
    },
    [applyUser, loadPreferences],
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
      const loggedUser = applyUser(json.user || null);
      if (loggedUser) {
        await loadPreferences();
      }
      setHydrated(true);
      return loggedUser;
    },
    [applyUser, loadPreferences],
  );

  const logout = useCallback(async (options = {}) => {
    const redirectTo = options?.redirectTo || null;
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
      setPreferences(DEFAULT_PREFERENCES);
      setCookie("showverse_default_view", "grid");
      if (redirectTo && typeof window !== "undefined") {
        window.location.replace(redirectTo);
        return;
      }
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
      preferences,
      loadingPreferences,
      updatePreference,
    }),
    [
      account,
      authenticated,
      hydrated,
      login,
      logout,
      refreshMe,
      register,
      session,
      user,
      preferences,
      loadingPreferences,
      updatePreference,
    ],
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
      preferences: DEFAULT_PREFERENCES,
      loadingPreferences: false,
      updatePreference: () => {},
    };
  }
  return ctx;
};
