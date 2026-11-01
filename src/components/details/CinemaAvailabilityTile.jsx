import { Ticket } from "lucide-react";
import { describeCinemaStatus, formatCinemaDate } from "@/lib/streaming/cinema";

// Píldora «En cines» de la fila de plataformas: misma altura que
// StreamingProviderLogo (44 px, esquinas xl) para alinearse con los logos, con
// texto porque un icono suelto no dice si ya está en cartelera. En cartelera
// es ámbar macizo; en preventa, solo el contorno y la fecha de estreno, para
// que no se lea como «ya en cines». Enlaza a Entradas.com (lista todas las
// salas) o, si no está, a la primera cadena. Las cadenas, en el hover.
export default function CinemaAvailabilityTile({ status, className = "" }) {
  const text = describeCinemaStatus(status);
  if (!text) return null;

  const upcoming = status.status === "upcoming";
  const date = upcoming ? formatCinemaDate(status.releaseDate) : null;

  return (
    <a
      href={status.href}
      target="_blank"
      rel="noreferrer"
      aria-label={`${text.label}: comprar entradas (${text.detail})`}
      className={`group/provider relative flex-shrink-0 cursor-pointer transform transition-transform hover:z-10 hover:scale-105 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-yellow-400 ${className}`}
    >
      <span
        className={`flex h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-xs font-bold shadow-lg ${
          upcoming
            ? "bg-black/40 text-amber-300 ring-2 ring-inset ring-amber-400/80"
            : "bg-gradient-to-br from-amber-300 to-amber-500 text-black"
        }`}
      >
        <Ticket className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden="true" />
        {upcoming ? (date ? `Estreno ${date}` : "Próximamente") : "En cines"}
      </span>
      <div className="pointer-events-none absolute top-full mt-2 left-1/2 z-[100] -translate-x-1/2 scale-95 whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-center text-[10px] font-bold text-white opacity-0 shadow-xl transition-all duration-200 ease-out group-hover/provider:scale-100 group-hover/provider:opacity-100">
        <span className="block text-amber-300">{text.label}</span>
        <span className="block font-normal text-zinc-300">{text.detail}</span>
      </div>
    </a>
  );
}
