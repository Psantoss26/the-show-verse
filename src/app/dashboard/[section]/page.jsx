import { cookies, headers } from "next/headers";
import DashboardSectionClient from "./DashboardSectionClient";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";
import {
  getBackendAccessToken,
  getBackendRefreshToken,
} from "@/lib/backend/server";
import { loadSectionBackdrops } from "@/lib/dashboard/sectionBackdrops";
import { loadSectionItems, SECTION_CONFIG } from "@/lib/dashboard/sectionItems";
import {
  readSectionViewPrefs,
  SECTION_VIEW_COOKIE,
} from "@/lib/dashboard/sectionViewPrefs";

// Lo que puede esperar el servidor a la lista antes de responder. Sin
// loading.jsx, la navegación espera al RSC con la página anterior a la vista;
// la lista sale del motor en milisegundos (medido: 8-15 ms en caliente, ~0,5 s
// Populares en frío). Si se pasa, la página llega sin ella y la pide el
// cliente, como antes.
const SSR_BUDGET_MS = 2500;

export async function generateMetadata({ params }) {
  const { section } = await params;
  return {
    title: SECTION_CONFIG[section]?.title || "Sección",
  };
}

// La lista de la sección, ya en el RSC: la página abre con su título y sus
// tarjetas finales, sin «Cargando» ni esqueletos.
//
// La sesión va con el token de acceso de la cookie y NUNCA con el de refresco:
// un render no puede escribir cookies, así que refrescar aquí rotaría el token
// del usuario sin guardar el nuevo. Si solo queda el de refresco (acceso
// caducado), la lista que daría el servidor sería la anónima: no se entrega y
// la pide el cliente por la ruta de la API, que sí refresca y guarda.
async function loadInitialSection(section) {
  if (!SECTION_CONFIG[section]) return null;
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  const accessCookies = {
    get: (name) =>
      /refresh/i.test(name) ? undefined : cookieStore.get(name),
  };
  const request = { cookies: accessCookies, headers: headerList };
  if (
    !getBackendAccessToken(request) &&
    getBackendRefreshToken({ cookies: cookieStore })
  ) {
    return null;
  }

  let timer = 0;
  const budget = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), SSR_BUDGET_MS);
  });
  try {
    const items = await Promise.race([
      loadSectionItems(section, { request }),
      budget,
    ]);
    // Vacía = el motor no respondió: mejor que la pida el cliente.
    if (!Array.isArray(items) || items.length === 0) return null;
    return { section, ...SECTION_CONFIG[section], items };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export default async function DashboardSectionPage({ params }) {
  const { section } = await params;
  const [initialData, cookieStore] = await Promise.all([
    loadInitialSection(section),
    cookies(),
  ]);
  const viewPrefs = readSectionViewPrefs(
    cookieStore.get(SECTION_VIEW_COOKIE)?.value,
  );
  // En vista lista o modo backdrop, los backdrops de la primera pantalla
  // también vienen elegidos: esas tarjetas no nacen vacías.
  const initialBackdrops =
    initialData &&
    (viewPrefs?.viewMode === "list" || viewPrefs?.imageMode === "backdrop")
      ? await loadSectionBackdrops(initialData.items)
      : null;
  const config = SECTION_CONFIG[section];
  // Ficha rápida (DetailModal) como drawer desde la derecha al pulsar una
  // tarjeta, igual que en Favoritos y el resto de páginas de usuario.
  return (
    <DetailModalProvider placement="right">
      <DashboardSectionClient
        section={section}
        initialData={initialData}
        initialTitle={config?.title || null}
        initialDescription={config?.description || null}
        initialViewMode={viewPrefs?.viewMode || null}
        initialImageMode={viewPrefs?.imageMode || null}
        initialBackdrops={initialBackdrops}
      />
    </DetailModalProvider>
  );
}
