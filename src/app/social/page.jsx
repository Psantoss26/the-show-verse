// src/app/social/page.jsx
import { cookies, headers } from "next/headers";
import SocialHub from "./SocialHub";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";
import {
  backendFetchPublicJson,
  getBackendAccessToken,
} from "@/lib/backend/server";
import {
  defaultSocialLanding,
  implicitSocialEntry,
  normalizeSocialView,
  normalizeTodayParams,
} from "@/lib/today/params";

export const metadata = {
  title: "Social",
  description: "Lo destacado de hoy y la actividad de la gente a la que sigues, y la tuya",
};

// Lo que puede esperar el servidor a los datos antes de responder; si se pasa,
// la página llega sin ellos y los pide el cliente (como /calendar).
const SSR_BUDGET_MS = 2500;

function withBudget(promise) {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), SSR_BUDGET_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

// Solo con el token de acceso, NUNCA con el de refresco: un render no puede
// escribir cookies y refrescar aquí rotaría el token sin guardar el nuevo. Sin
// token de acceso no se entrega nada y lo pide el cliente por /api/users/today.
async function loadInitialToday({ scope, day, cookieStore, headerList }) {
  const accessCookies = {
    get: (name) => (/refresh/i.test(name) ? undefined : cookieStore.get(name)),
  };
  const request = { cookies: accessCookies, headers: headerList };
  if (!getBackendAccessToken(request)) return null;
  try {
    const result = await withBudget(
      backendFetchPublicJson(
        request,
        `/v1/users/today?scope=${scope}&day=${encodeURIComponent(day)}`,
        { method: "GET" },
      ),
    );
    return result?.ok && Array.isArray(result.json?.actions) ? result.json : null;
  } catch {
    return null;
  }
}

export default async function SocialPage({ searchParams }) {
  const [params, cookieStore, headerList] = await Promise.all([searchParams, cookies(), headers()]);
  let view = normalizeSocialView(params);
  let { scope, day, group } = normalizeTodayParams(params);
  // Los datos de «Hoy» van en el RSC solo si se abre en esa opción; Siguiendo y
  // Yo los pide el cliente como siempre.
  let data = view === "today"
    ? await loadInitialToday({ scope, day, cookieStore, headerList })
    : null;

  // Entrando sin elegir nada, un «Hoy» vacío salta a la Semana, y una semana
  // vacía a Siguiendo. Sin datos del servidor lo decide el cliente al llegar
  // los recuentos (autoLanding).
  const implicit = implicitSocialEntry(params);
  let autoLanding = null;
  if (view === "today" && implicit.day) {
    const landing = data ? defaultSocialLanding(data.days) : null;
    if (landing === "activity" && implicit.view) {
      view = "activity";
      data = null;
    } else if (landing === "week" || landing === "activity") {
      day = "week";
      data = await loadInitialToday({ scope, day, cookieStore, headerList });
    } else if (!data) {
      autoLanding = implicit;
    }
  }

  return (
    <DetailModalProvider placement="right">
      <SocialHub initialView={view} initialToday={{ scope, day, group, data, autoLanding }} />
    </DetailModalProvider>
  );
}
