// Respuesta HTML de las rutas /s/* (vista previa para rastreadores). Ver
// shareMeta.js y el middleware, que reescribe /details/* a estas rutas cuando
// quien pide la página es WhatsApp, Telegram, Discord, etc.
import { headers } from "next/headers";
import { getShareData, renderShareHtml } from "./shareMeta.js";

async function baseUrlFromHeaders() {
  const h = await headers();
  const proto = (h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  const host = (h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim();
  if (host) return `${proto}://${host}`;
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "http://localhost:3000"
  );
}

export async function shareResponse(query, fallbackPath) {
  const [baseUrl, data] = await Promise.all([baseUrlFromHeaders(), getShareData(query)]);
  return new Response(renderShareHtml(data, baseUrl, fallbackPath), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
