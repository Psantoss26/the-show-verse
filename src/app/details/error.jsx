"use client";

// Límite de error compartido por TODAS las rutas /details/*.
//
// Antes, cualquier fallo TEMPORAL de TMDb/red al cargar una ficha (5xx, 429,
// timeout, túnel caído…) se traducía en `null` → `notFound()` → un "página no
// encontrada" permanente, indistinguible de un título que de verdad no existe.
// Ahora la ruta LANZA `TmdbUnavailableError` en esos casos (ver getDetails con
// `throwOnUnavailable`) y ese error llega aquí, donde ofrecemos "reintentar" en
// lugar de un falso 404. `reset()` vuelve a renderizar el segmento, lo que
// repite el fetch en el servidor.
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowLeft } from "lucide-react";

export default function DetailsError({ error, reset }) {
  const router = useRouter();

  useEffect(() => {
    // Deja rastro para diagnóstico (sin romper el render).
    console.error("[details] error al cargar la ficha:", error);
  }, [error]);

  return (
    <div
      data-details-root
      className="relative min-h-screen bg-[#101010] text-gray-100"
    >
      <div className="fixed inset-0 z-0 bg-[#0a0a0a]" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <RefreshCw className="h-7 w-7 text-amber-400" aria-hidden="true" />
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
            No se pudo cargar la ficha
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
            Ha habido un problema temporal al conectar con el catálogo. El título
            existe; vuelve a intentarlo en un momento.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => reset()}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-extrabold uppercase tracking-wide text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.45)] transition-all hover:bg-white/90 active:scale-[0.98] sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 text-sm font-bold text-zinc-200 transition-all hover:bg-white/10 active:scale-[0.98] sm:w-auto"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
