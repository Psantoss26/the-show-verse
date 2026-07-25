"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";

// Botón de seguir/dejar de seguir reutilizable. Optimista con reversión si la
// petición falla. `size` "md" (por defecto) o "sm" (para filas de listas).
export default function FollowButton({
  username,
  initialFollowing,
  onChange,
  size = "md",
  className = "",
}) {
  const [following, setFollowing] = useState(Boolean(initialFollowing));
  const [busy, setBusy] = useState(false);

  useEffect(() => setFollowing(Boolean(initialFollowing)), [initialFollowing]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(username)}/follow`, {
        method: next ? "POST" : "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      const confirmed = Boolean(data?.following);
      setFollowing(confirmed);
      onChange?.(confirmed);
    } catch {
      setFollowing(!next);
    } finally {
      setBusy(false);
    }
  }, [busy, following, username, onChange]);

  const dims =
    size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-5 text-sm";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-full font-bold transition-all active:scale-[0.98] disabled:opacity-60 ${dims} ${
        following
          ? "border border-white/15 bg-white/5 text-zinc-200 hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-300"
          : "bg-emerald-500 text-black shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)] hover:bg-emerald-400"
      } ${className}`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : following ? (
        <UserCheck className="h-4 w-4" />
      ) : (
        <UserPlus className="h-4 w-4" />
      )}
      {following ? "Siguiendo" : "Seguir"}
    </button>
  );
}
