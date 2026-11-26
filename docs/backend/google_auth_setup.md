# Google Auth Setup

Esta guia cubre el login/registro con Google usando la cuenta propia de The Show Verse.

## Flujo

**Web (ordenador, móvil y PWA): botón oficial de Google.** `/login` pinta el
botón de Google Identity Services (`src/components/auth/GoogleSignInButton.jsx`):
el diseño y el texto son los de Google («Continuar con Google» o
«Registrarse con Google»), y al pulsarlo se abre la ventana de Google para elegir
cuenta sin salir de la página (una ventana emergente de Google en todos los
navegadores). No se usa FedCM (`use_fedcm_for_button`): si Google rechaza el
token —por ejemplo, porque el origen no está autorizado—, Chrome solo registra
`FedCM get() rejects with NetworkError: Error retrieving a token` y el botón no
hace nada; con la ventana emergente se ve el error de Google.

1. Google devuelve un `idToken` al botón.
2. `loginWithGoogle` (`AuthContext`) lo envía a `/api/auth/google/native`.
3. Next.js lo reenvía al backend en `/v1/auth/google`, que lo valida contra
   Google (incluido el `aud`), crea o recupera el usuario y devuelve tokens propios.
4. Next.js guarda `showverse_access_token` y `showverse_refresh_token` como
   cookies httpOnly y devuelve el usuario.
5. El usuario entra en el contexto y solo entonces se navega a `next`: la página
   de destino se pinta ya con la sesión, sin parpadeo. Mientras, el formulario
   enseña «Entrando con Google…».

**Respaldo por redirección.** Si el script de Google no carga (sin red,
bloqueador, origen no autorizado), el botón se sustituye por un enlace a
`/api/auth/google/start`. También queda bajo el botón oficial el enlace
«¿No se abre la ventana? Usa la página de Google».

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

Authorized JavaScript origins (el botón oficial solo funciona en estos orígenes;
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
