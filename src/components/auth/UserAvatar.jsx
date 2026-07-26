"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import OptimizedImage from "@/components/OptimizedImage";

function getInitials(account) {
  const source = account?.displayName || account?.name || account?.username || "TSV";
  return String(source)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function UserAvatar({ account, className = "" }) {
  const pathname = usePathname();
  const avatarUrl = account?.avatarUrl || account?.avatar_path || null;
  const label = account?.displayName || account?.name || account?.username || "Mi perfil";
  const isWithinProfile = pathname === "/profile" || pathname?.startsWith("/profile/");

  const handleProfileClick = (event) => {
    // El avatar sigue siendo un enlace real (teclado, menú contextual y nueva
    // pestaña), pero una pulsación normal dentro de Perfil no debe reemitir la
    // ruta raíz ni reinicializar la sección que el usuario está viendo.
    if (
      isWithinProfile &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      event.preventDefault();
    }
  };

  return (
    <Link
      href="/profile"
      onClick={handleProfileClick}
      aria-label={label}
      title={label}
      className={`flex-shrink-0 rounded-full p-[2px] bg-neutral-700 hover:bg-white/30 transition-colors duration-200 ${className}`}
    >
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-xs font-black text-white">
        {avatarUrl ? (
          <OptimizedImage
            src={avatarUrl}
            alt={label}
            priority
            fetchPriority="high"
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{getInitials(account)}</span>
        )}
      </div>
    </Link>
  );
}
