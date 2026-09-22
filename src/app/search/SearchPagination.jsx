// Paginación de la página de resultados de búsqueda. Son enlaces normales (no
// botones con estado), así que cada página tiene su URL y el teclado, el lector
// de pantalla y atrás/adelante funcionan sin JavaScript adicional.
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buildSearchHref, paginationWindow } from "@/lib/search/searchPage";

const ITEM =
  "inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400";
const IDLE = "bg-white/[0.06] text-zinc-300 hover:bg-white/[0.12] hover:text-white";
const DISABLED = "bg-white/[0.03] text-zinc-600";

export default function SearchPagination({ query, type, page, totalPages }) {
  const hrefFor = (p) => buildSearchHref({ q: query, type, page: p });
  const prev = page > 1 ? hrefFor(page - 1) : null;
  const next = page < totalPages ? hrefFor(page + 1) : null;
  const items = paginationWindow(page, totalPages).map((p) =>
    p === "gap" ? { gap: true } : { page: p, href: hrefFor(p) },
  );

  return (
    <nav aria-label="Páginas de resultados" className="mt-12 flex justify-center pb-8">
      <ul className="flex flex-wrap items-center justify-center gap-2">
        <li>
          {prev ? (
            <Link href={prev} className={`${ITEM} ${IDLE} gap-1`} rel="prev">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">Anterior</span>
            </Link>
          ) : (
            <span className={`${ITEM} ${DISABLED} gap-1`} aria-disabled="true">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">Anterior</span>
            </span>
          )}
        </li>

        {items.map((item, index) =>
          item.gap ? (
            <li key={`gap-${index}`} className="px-1 text-zinc-600" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item.page}>
              <Link
                href={item.href}
                aria-current={item.page === page ? "page" : undefined}
                aria-label={`Página ${item.page} de ${totalPages}`}
                className={`${ITEM} ${item.page === page ? "bg-white text-black" : IDLE}`}
              >
                {item.page}
              </Link>
            </li>
          ),
        )}

        <li>
          {next ? (
            <Link href={next} className={`${ITEM} ${IDLE} gap-1`} rel="next">
              <span className="max-sm:sr-only">Siguiente</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={`${ITEM} ${DISABLED} gap-1`} aria-disabled="true">
              <span className="max-sm:sr-only">Siguiente</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </li>
      </ul>
    </nav>
  );
}
