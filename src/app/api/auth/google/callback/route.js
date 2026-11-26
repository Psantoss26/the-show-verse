import { NextResponse } from "next/server";
import {
  backendAuthRequest,
} from "../../_utils";
import {
  clearBackendAuthCookies,
  getCookieSecure,
  setBackendTokenCookies,
} from "@/lib/backend/server";
import { buscarPorEstado, completarEntrega } from "../handoffStore";
import {
  GOOGLE_SESSION_PARAM,
  normalizeBackendGoogleError,
} from "@/lib/auth/googleSignIn";
import {
  buildAndroidHandoffPage,
  buildAndroidOauthHandoffUrl,
  buildAuthTabReturnUrl,
  clearGoogleOauthCookies,
  exchangeGoogleCode,
  getGoogleRedirectUri,
  getRequestOrigin,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  isAndroidOauthState,
  sanitizeNextPath,
} from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cabecerasHtml = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

function redirectToLogin(request, next, reason) {
  const url = new URL("/login", getRequestOrigin(request));
  url.searchParams.set("next", sanitizeNextPath(next));
  if (reason) url.searchParams.set("google_error", reason);
  const response = NextResponse.redirect(url);
  clearGoogleOauthCookies(response, request);
  return response;
}

function exchangeCodeForTokens(request, code) {
  return exchangeGoogleCode(code, getGoogleRedirectUri(request));
}

export async function GET(request) {
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const appHandoff = request.nextUrl.searchParams.get("app_handoff") === "1";

  // La primera llegada ocurre en la Custom Tab de Google, que no comparte las
  // cookies del WebView. Solo se transportan `code` y `state` a la app; allí se
  // vuelve a cargar este callback y se ejecuta la validación normal de abajo.
  // ---- LOGIN VENIDO DE LA APP DE ANDROID ----
  //
  // Esta petición la hace CHROME, que no comparte cookies con el WebView: aquí
  // no existe la cookie de `state` ni serviría de nada dejar las de sesión. Se
  // valida el `state` contra la entrega abierta en /start, se canjea el código y
  // los tokens quedan guardados para que la app los reclame. La página de vuelta
  // sigue intentando devolver el control por el enlace de la app, pero ya no es
  // imprescindible: aunque el navegador lo bloquee, la app recogerá la sesión.
  if (isAndroidOauthState(state) && !appHandoff) {
    const entrega = buscarPorEstado(state);
    const origen = getRequestOrigin(request);

    // SIN ENTREGA: se hace lo de siempre, que ya funcionaba. Devolver el código
    // a la app para que complete el canje con SU cookie de `state`. Pasa cuando
    // el login lo arranca una versión anterior de la app, o cuando se pulsa el
    // botón antes de que la web detecte que está dentro de ella. Exigir aquí una
    // entrega dejaba tirados esos casos.
    if (!entrega) {
      const clasico = buildAndroidOauthHandoffUrl(origen, {
        code,
        state,
        error,
      }).toString();
      return new NextResponse(buildAndroidHandoffPage(clasico), {
        status: 200,
        headers: cabecerasHtml,
      });
    }

    if (error) {
      completarEntrega(entrega.appId, { error });
    } else if (!code) {
      completarEntrega(entrega.appId, { error: "missing_code" });
    } else {
      const googleTokens = await exchangeCodeForTokens(request, code);
      if (!googleTokens.ok || !googleTokens.json?.id_token) {
        completarEntrega(entrega.appId, {
          error: googleTokens.error || "token_exchange_failed",
        });
      } else {
        let backend;
        try {
          backend = await backendAuthRequest("/v1/auth/google", {
            method: "POST",
            body: JSON.stringify({ idToken: googleTokens.json.id_token }),
          });
        } catch (e) {
          backend = { ok: false, error: "backend_unavailable" };
        }

        if (!backend.ok || !backend.json?.accessToken || !backend.json?.refreshToken) {
          completarEntrega(entrega.appId, {
            error: normalizeBackendGoogleError(backend.error, backend.status),
          });
        } else {
          completarEntrega(entrega.appId, {
            accessToken: backend.json.accessToken,
            refreshToken: backend.json.refreshToken,
          });
        }
      }
    }

    // AUTH TAB: la pestaña de Chrome se cierra al ver el esquema propio y la app
    // recoge la sesión al instante, sin pantalla intermedia.
    if (entrega.authTab) {
      return NextResponse.redirect(buildAuthTabReturnUrl(entrega.appId), { status: 303 });
    }

    // VUELTA AUTOMÁTICA (pestaña normal). Se redirige a una URL **https** del propio dominio, no
    // al esquema `theshowverse://`: con los App Links verificados
    // (`/.well-known/assetlinks.json`), Android intercepta esa navegación y la
    // entrega a la app sin pedir nada al usuario. El esquema propio necesitaba
    // un gesto —el botón— porque Chrome bloquea el salto a otra app cuando
    // llega por redirección.
    //
    // El destino es una pantalla MÍNIMA (negra, con el logotipo), no /login: si
    // los App Links no están verificados, el navegador la pinta durante el
    // instante que tarda la app en traerse al frente, y así no se ve la web
    // entera —ni una sesión iniciada en el navegador— en mitad del proceso.
    const vuelta = new URL(
      `/api/auth/google/done?claim=${encodeURIComponent(entrega.appId)}`,
      origen,
    );
    return NextResponse.redirect(vuelta, { status: 303 });
  }

  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  // El `state` vale si coincide con la cookie O si corresponde a una entrega
  // abierta en /start. Lo segundo cubre a la app: al mandar Google al navegador
  // se cancela la navegación, y con ella se puede perder la cookie.
  const entregaDelEstado = state ? buscarPorEstado(state) : null;
  const next = sanitizeNextPath(
    request.cookies.get(GOOGLE_OAUTH_NEXT_COOKIE)?.value ||
      entregaDelEstado?.next ||
      "/",
  );

  if (error) return redirectToLogin(request, next, error);
  if (!code) return redirectToLogin(request, next, "missing_code");
  if (!state || (expectedState !== state && !entregaDelEstado)) {
    return redirectToLogin(request, next, "invalid_state");
  }

  const googleTokens = await exchangeCodeForTokens(request, code);
  if (!googleTokens.ok || !googleTokens.json?.id_token) {
    return redirectToLogin(request, next, googleTokens.error || "token_exchange_failed");
  }

  let backend;
  try {
    backend = await backendAuthRequest("/v1/auth/google", {
      method: "POST",
      body: JSON.stringify({ idToken: googleTokens.json.id_token }),
    });
  } catch (error) {
    console.error("[google-auth] backend request failed", {
      message: error?.message || String(error),
    });
    return redirectToLogin(request, next, "backend_unavailable");
  }

  if (!backend.ok || !backend.json?.accessToken || !backend.json?.refreshToken) {
    console.error("[google-auth] backend rejected Google login", {
      status: backend.status,
      error: backend.error,
    });
    return redirectToLogin(
      request,
      next,
      normalizeBackendGoogleError(backend.error, backend.status),
    );
  }

  // Se vuelve por /login y no directamente a `next`: el navegador todavía no
  // tiene el usuario en caché, y la página de destino se pintaría un instante
  // sin sesión. /login enseña «Entrando…» hasta que /api/auth/me responde y
  // entonces navega a `next` con la sesión ya en el contexto.
  const destino = new URL("/login", getRequestOrigin(request));
  destino.searchParams.set("next", next);
  destino.searchParams.set(GOOGLE_SESSION_PARAM, "1");
  const response = NextResponse.redirect(destino);
  clearGoogleOauthCookies(response, request);
  clearBackendAuthCookies(response, { secure: getCookieSecure(request) });
  setBackendTokenCookies(response, backend.json, {
    secure: getCookieSecure(request),
  });
  return response;
}
