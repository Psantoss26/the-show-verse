import OptimizedImage from "@/components/OptimizedImage";

// Los logos proceden de proveedores distintos (TMDb, JustWatch y Plex) y no
// todos comparten la misma proporción interna. Esta celda fija su huella visual
// antes de que cargue la imagen y recorta la ilustración a un cuadrado común.
// Así ninguno puede crecer respecto al resto por sus dimensiones originales.
// El indicador de Plex es una insignia centrada sobre la curva de la esquina
// superior derecha del logo (mitad dentro, mitad fuera), sin anillo: un anillo
// negro dibujaba un borde oscuro sobre fondos de cristal.
// Con rounded-xl (12 px) el punto de 45° del arco queda a ~3,5 px de cada
// borde; un punto de 10 px centrado ahí va a -1,5 px.

// Punto «disponible en tu servidor Plex». Se coloca con `className` respecto a
// la caja del logo (position: relative en el padre).
export function PlexAvailabilityDot({ className = "-right-[1.5px] -top-[1.5px]" }) {
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute z-10 h-2.5 w-2.5 rounded-full bg-gradient-to-b from-emerald-300 to-emerald-500 shadow-[0_0_0_0.5px_rgba(16,185,129,0.6),0_1px_2px_rgba(0,0,0,0.35),0_0_6px_rgba(52,211,153,0.55)] ${className}`}
    />
  );
}

export default function StreamingProviderLogo({
  provider,
  onError,
  className = "",
}) {
  if (!provider?.icon) return null;

  return (
    <span
      className={`relative block h-11 w-11 shrink-0 overflow-visible rounded-xl bg-white/5 shadow-lg ${className}`}
    >
      <OptimizedImage
        src={provider.icon}
        alt=""
        className="absolute inset-0 h-full w-full rounded-xl object-cover"
        onError={onError}
      />
      {provider.isPlexProvider && (
        <PlexAvailabilityDot />
      )}
    </span>
  );
}
