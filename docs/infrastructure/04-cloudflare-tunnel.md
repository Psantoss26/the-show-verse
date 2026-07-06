# 04 · Cloudflare Tunnel

Publica la web (`theshowverse.com`) en Internet **sin abrir puertos** en el router,
con TLS y DNS gestionados por Cloudflare. El contenedor `cloudflared` abre una
conexión **saliente** al edge de Cloudflare y reenvía el tráfico al servicio `web`.

## Cómo encaja en el stack

```
Navegador ──HTTPS──► Cloudflare edge ──túnel saliente──► cloudflared ──► web:3000
```

En `deploy/nas/docker-compose.yml`:

```yaml
cloudflared:
  image: cloudflare/cloudflared:latest
  command: tunnel --no-autoupdate run
  environment:
    TUNNEL_TOKEN: ${CF_TUNNEL_TOKEN}   # viene de deploy/nas/.env
  depends_on: [web]
```

El servicio `web` declara además un **alias de red** `the-show-verse`, para que una
ruta de túnel previa (`http://the-show-verse:3000`) siga funcionando. Como
`cloudflared` está en la misma red del compose, alcanza la web por nombre de
servicio (`web:3000` o `the-show-verse:3000`).

## Puesta en marcha (una vez)

1. **Crear el túnel** (Cloudflare Zero Trust → *Networks → Tunnels → Create a
   tunnel*, tipo *Cloudflared*). Copia el **token** del túnel.
2. Guarda el token en `deploy/nas/.env`:

   ```bash
   CF_TUNNEL_TOKEN=eyJ...   # token del panel
   ```

3. **Ruta de hostname público** (en el mismo túnel → pestaña *Public Hostname*):

   | Campo | Valor |
   |---|---|
   | Subdomain / Domain | `theshowverse.com` (y/o `www`) |
   | Type | `HTTP` |
   | URL | `web:3000` (o `the-show-verse:3000`) |

   Cloudflare crea automáticamente el registro DNS (CNAME al túnel) y gestiona el
   certificado TLS. El origen es HTTP porque el TLS lo termina Cloudflare.

4. Levanta el stack: `docker compose -f deploy/nas/docker-compose.yml up -d`.
   Comprueba: `docker compose ... logs -f cloudflared` (debe mostrar el túnel
   conectado y las rutas registradas).

## Origen público y OAuth

La app construye las redirecciones OAuth a partir del **origen público**
(`NEXT_PUBLIC_APP_URL` / cabeceras del proxy), no de la URL interna de la request.
Asegúrate de que en Cloudflare/tu configuración el host público sea
`https://theshowverse.com` y de que las **URIs de redirección** en Google/Trakt
apunten a ese dominio público (no a `localhost` ni a `web:3000`):

- Google: `https://theshowverse.com/auth/callback`
- Trakt:  `https://theshowverse.com/api/trakt/auth/callback`

## Buenas prácticas

- **No** publiques `postgres`, `redis`, `backend` ni `ollama` como hostnames del
  túnel: solo la `web`. El resto queda en la red interna.
- Activa en Cloudflare las protecciones estándar (WAF, *Always Use HTTPS*,
  *Bot Fight Mode* si procede).
- El token del túnel es un **secreto**: vive solo en `deploy/nas/.env` (gitignored).
