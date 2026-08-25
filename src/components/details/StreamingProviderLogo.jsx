import OptimizedImage from "@/components/OptimizedImage";

// Los logos proceden de proveedores distintos (TMDb, JustWatch y Plex) y no
// todos comparten la misma proporción interna. Esta celda fija su huella visual
// antes de que cargue la imagen y recorta la ilustración a un cuadrado común.
// Así ninguno puede crecer respecto al resto por sus dimensiones originales.
// El indicador de Plex queda fuera de esa zona de recorte para que no se corte
// al sobresalir por la esquina superior derecha.
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
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-green-500 ring-2 ring-black" />
      )}
    </span>
  );
}
