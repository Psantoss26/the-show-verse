"use client";

import { usePathname } from "next/navigation";
import { showsDesktopSideNav } from "@/lib/ui/mobileBottomNav";

// Hueco de la barra lateral de escritorio (ver Navbar): igual que el contenedor
// reserva abajo el alto de la barra inferior en móvil, aquí reserva a la
// izquierda su ancho (1rem de margen + 3.5rem de barra) para que nunca tape
// contenido. Se decide por la ruta, que ya se conoce en el render del servidor:
// la página no salta al hidratar.
export default function DesktopSideNavInset({ className = "", children, ...props }) {
  const pathname = usePathname();
  const inset = showsDesktopSideNav(pathname) ? " desktop:pl-[4.5rem]" : "";
  return (
    <div {...props} className={`${className}${inset}`}>
      {children}
    </div>
  );
}
