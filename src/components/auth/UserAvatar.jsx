"use client";


import OptimizedImage from "@/components/OptimizedImage";
import { useEffect, useState } from "react";
import Link from "next/link";

export default function UserAvatar() {
  const [traktAvatarUrl, setTraktAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadTraktAvatar() {
      try {
        const res = await fetch("/api/trakt/profile?userOnly=1", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const data = await res.json();
        const url = data?.user?.avatarUrl;
        if (!cancelled) {
          setAvailable(!!url);
          if (url) setTraktAvatarUrl(url);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    loadTraktAvatar();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Link
        href="/profile"
        aria-label="Mi perfil"
        className="flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200"
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-neutral-800">
          <div className="w-full h-full animate-pulse" />
        </div>
      </Link>
    );
  }

  if (!available) {
    return (
      <a
        href="/api/trakt/auth/start?next=/profile"
        className="flex-shrink-0 rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 lg:px-4 lg:py-2"
      >
        <span className="hidden lg:inline">Iniciar sesión</span>
        <span className="lg:hidden">Acceder</span>
      </a>
    );
  }

  return (
    <Link
      href="/profile"
      aria-label="Mi perfil"
      className="flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200"
    >
      <div className="w-9 h-9 rounded-full overflow-hidden">
        <OptimizedImage
          src={traktAvatarUrl}
          alt="Usuario"
          className="w-full h-full object-cover"
        />
      </div>
    </Link>
  );
}
