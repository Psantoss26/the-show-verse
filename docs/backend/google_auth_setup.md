# Google Auth Setup

Esta guia cubre el login/registro con Google usando la cuenta propia de The Show Verse.

## Flujo

**Web (ordenador, móvil y PWA): botón propio + ventana oficial de Google.**
`/login` pinta su propio botón (`src/components/auth/GoogleSignInButton.jsx`)
con el vidrio de los botones de los modales de la ficha
(`LIQUID_GLASS_MODAL_BUTTON`), 44 px de alto y la «G» de Google a color («Continuar con Google» o «Registrarse con Google»). El
mismo aspecto se usa en la app de Android, en el respaldo y en «Entrando con
Google…». Al pulsarlo se abre la ventana emergente oficial de Google para elegir
cuenta sin salir de la página (Google Identity Services,
`google.accounts.oauth2.initCodeClient` con `ux_mode: "popup"`). El cliente se
prepara al cargar la página: la ventana tiene que abrirse en el mismo clic o el
navegador la bloquea.

No se usa el botón de Google en iframe (`renderButton`): su diseño no se puede
adaptar. Tampoco FedCM: si Google rechaza el token —por ejemplo, porque el
origen no está autorizado—, Chrome solo registra
`FedCM get() rejects with NetworkError: Error retrieving a token` y el botón no
hace nada.

1. Google devuelve un `code` de un solo uso al botón.
2. `loginWithGoogle` (`AuthContext`) lo envía a `/api/auth/google/native` como
   `{ code }`, y Next.js lo canjea con el secreto del cliente y
   `redirect_uri = "postmessage"` (`exchangeGoogleCode` en
   `src/app/api/auth/google/_utils.js`) por un `id_token`.
3. Next.js lo reenvía al backend en `/v1/auth/google`, que lo valida contra
   Google (incluido el `aud`), crea o recupera el usuario y devuelve tokens propios.
4. Next.js guarda `showverse_access_token` y `showverse_refresh_token` como
   cookies httpOnly y devuelve el usuario.
5. El usuario entra en el contexto y solo entonces se navega a `next`: la página
   de destino se pinta ya con la sesión, sin parpadeo. Mientras, el formulario
   enseña «Entrando con Google…».

**Respaldo por redirección.** El botón es un enlace a `/api/auth/google/start`:
si el script de Google no carga (sin red, bloqueador) o el navegador no deja
abrir la ventana (`popup_failed_to_open`), se entra por la página de Google.
Cerrar la ventana no hace nada; otros errores se explican en el formulario.

1. `/api/auth/google/start` redirige a Google OAuth.
2. Google vuelve a `/api/auth/google/callback`, que canjea el `code` por un
   `id_token` y sigue como en los pasos 3-4.
3. El callback vuelve a `/login?next=…&google_session=1`, que enseña «Entrando…»
   hasta que `/api/auth/me` carga el usuario y entonces navega a `next`.

**App de Android.** Google no permite su ventana dentro de un WebView: la app
usa el selector nativo de cuentas y, si falla, el login en el navegador. Ver
[Login con Google dentro de la app](../android-play-store.md#3bis-login-con-google-dentro-de-la-app).

## Google Cloud Console

Crea un OAuth Client de tipo `Web application`.

Authorized JavaScript origins (la ventana de Google solo funciona en estos orígenes;
para `localhost` Google pide también la entrada sin puerto):

```text
http://localhost
http://localhost:3000
https://theshowverse.com
https://TU-DOMINIO-DE-VERCEL
https://theshowverse.netlify.app
```

Authorized redirect URIs:

```text
http://localhost:3000/api/auth/google/callback
https://TU-DOMINIO-DE-VERCEL/api/auth/google/callback
https://theshowverse.netlify.app/api/auth/google/callback
```

## Variables En Vercel

Estas variables las usa el frontend/BFF de Next.js:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://TU-DOMINIO-DE-VERCEL/api/auth/google/callback
BACKEND_API_BASE_URL=https://the-show-verse-production.up.railway.app
```

## Variables En Netlify

Estas variables las usa el frontend/BFF de Next.js en Netlify:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://theshowverse.netlify.app/api/auth/google/callback
NEXT_PUBLIC_APP_URL=https://theshowverse.netlify.app
NEXT_PUBLIC_SITE_URL=https://theshowverse.netlify.app
APP_URL=https://theshowverse.netlify.app
NEXT_PUBLIC_API_BASE_URL=https://the-show-verse-production.up.railway.app
BACKEND_API_BASE_URL=https://the-show-verse-production.up.railway.app
```

En local puedes usar:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
BACKEND_API_BASE_URL=http://localhost:3001
```

## Variables En Railway

El backend necesita validar que el `id_token` fue emitido para tu app:

```env
GOOGLE_CLIENT_ID=...
FRONTEND_URL=https://theshowverse.netlify.app
FRONTEND_URLS=https://theshowverse.netlify.app,https://TU-DOMINIO-DE-VERCEL
```

No pongas `GOOGLE_CLIENT_SECRET` en Railway si solo lo usa Next.js para intercambiar el `code`.

## Prueba Manual

1. Arranca backend y frontend.
2. Abre `/login`.
3. Pulsa `Continuar con Google`.
4. Elige cuenta.
5. Debes volver a la ruta `next` y quedar autenticado.
6. En PostgreSQL deben existir:
   - un registro en `users`;
   - un registro en `connected_accounts` con `provider = 'google'`.

Si falla, revisa:

- `google_error=missing_config`: faltan variables en Vercel/local.
- `google_error=invalid_state`: el callback no coincide con la cookie de inicio; suele ser dominio/HTTPS/cookies.
- `google_error=backend_auth_failed`: el backend no acepto el token; revisa `GOOGLE_CLIENT_ID` en Railway.
- `google_error=backend_route_not_found`: `BACKEND_API_BASE_URL` apunta al sitio equivocado o a un backend sin `/v1/auth/google`.
- `google_error=backend_cors_origin`: falta `https://theshowverse.netlify.app` en `FRONTEND_URLS` de Railway.
- `google_error=google_token_rejected`: Netlify y Railway no usan el mismo `GOOGLE_CLIENT_ID`.
- `google_error=backend_server_error`: el backend fallo al crear la sesion; revisa logs de Railway para `/v1/auth/google`.
