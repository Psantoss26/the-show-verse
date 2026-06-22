import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Página a la que Plex redirige el POPUP tras autorizar. La ventana principal
// detecta el token por sondeo, así que aquí solo mostramos un mensaje y cerramos.
export async function GET() {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Plex conectado</title></head>
<body style="margin:0;background:#0b0b0c;color:#e4e4e7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;padding:24px">
  <div>
    <div style="height:4px;width:48px;border-radius:99px;background:#e5a00d;margin:0 auto 18px"></div>
    <h1 style="font-size:18px;margin:0 0 8px">Cuenta de Plex autorizada</h1>
    <p style="font-size:13px;color:#a1a1aa;margin:0">Ya puedes cerrar esta ventana y volver a The Show Verse.</p>
  </div>
  <script>try{window.close();}catch(e){}setTimeout(function(){try{window.close();}catch(e){}},1500);</script>
</body></html>`;
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
