# Google Auth Setup

Esta guia cubre el login/registro con Google usando la cuenta propia de The Show Verse.

## Flujo

1. El usuario pulsa `Continuar con Google` en `/login`.
2. Next.js redirige desde `/api/auth/google/start` a Google OAuth.
3. Google vuelve a `/api/auth/google/callback`.
4. Next.js intercambia el `code` por un `id_token`.
5. Next.js envia el `id_token` al backend en `/v1/auth/google`.
6. El backend valida Google, crea o recupera el usuario en PostgreSQL y devuelve tokens propios.
7. Next.js guarda `showverse_access_token` y `showverse_refresh_token` como cookies httpOnly.

## Google Cloud Console

Crea un OAuth Client de tipo `Web application`.

Authorized JavaScript origins:

```text
http://localhost:3000
https://TU-DOMINIO-DE-VERCEL
```

Authorized redirect URIs:

```text
http://localhost:3000/api/auth/google/callback
https://TU-DOMINIO-DE-VERCEL/api/auth/google/callback
```

## Variables En Vercel

Estas variables las usa el frontend/BFF de Next.js:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://TU-DOMINIO-DE-VERCEL/api/auth/google/callback
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
