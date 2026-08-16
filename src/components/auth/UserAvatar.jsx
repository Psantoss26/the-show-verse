"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Avatar from "@/components/ui/Avatar";

// Mismo marco que el avatar real —anillo, tamaño y tipografía— para que el
// relevo al hidratar no mueva ni un píxel. Lo de dentro lo pone `.avatar-boot`
// (globals.css) leyendo lo que AvatarBootScript dejó en :root: la foto del
// usuario o, si no tiene, su inicial. Vive aquí, pegado a UserAvatar, porque
// ambos deben cambiar a la vez si cambia el marco.
export function UserAvatarBoot({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`block flex-shrink-0 rounded-full bg-neutral-700 p-[2px] ${className}`}
    >
      <span className="avatar-boot flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-sm font-black text-white" />
    </span>
  );
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
      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-neutral-900 text-sm font-black text-white">
        <Avatar
          src={avatarUrl}
          name={account?.displayName || account?.name || account?.username}
          alt={label}
          priority
          fetchPriority="high"
        />
      </div>
    </Link>
  );
}
