// src/app/today/page.jsx
import { cookies, headers } from "next/headers";
import TodayClient from "./TodayClient";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";
import {
  backendFetchPublicJson,
  getBackendAccessToken,
} from "@/lib/backend/server";
import { normalizeTodayParams } from "@/lib/today/params";

export const metadata = {
  title: "Hoy",
  description: "Lo más destacado de lo que ha visto y opinado la gente hoy, ayer y esta semana",
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

export default async function TodayPage({ searchParams }) {
  const [params, cookieStore, headerList] = await Promise.all([searchParams, cookies(), headers()]);
  const { scope, day, group } = normalizeTodayParams(params);
  const initialData = await loadInitialToday({ scope, day, cookieStore, headerList });

  return (
    <DetailModalProvider placement="right">
      <TodayClient
        initialScope={scope}
        initialDay={day}
        initialGroup={group}
        initialData={initialData}
      />
    </DetailModalProvider>
  );
}
