# ▶️ Arranque local — guía exacta (paso a paso, verificada)

Cómo levantar **el proyecto completo** (web + backend + BBDD + caché) en tu máquina,
en cualquier momento. Verificado end-to-end el 2026-07-04:
`/health` ok · dashboard 16 filas · calendario con episodios reales · home SSR HTTP 200.

- **Web:** http://localhost:3000
- **API:** http://localhost:3001  (health: http://localhost:3001/health)

---

## ✅ Requisito previo (una sola vez): usar Docker sin sudo

Ya tienes Docker instalado y estás en el grupo `docker`, pero tu sesión necesita
recargarlo. **Cierra sesión y vuelve a entrar (o reinicia) UNA vez.** Comprueba:

```bash
docker ps          # debe listar contenedores SIN sudo
```

> Si aún diera `permission denied`, no habías reiniciado la sesión. Alternativa sin
> reiniciar: `su - pablo` (te pide contraseña) abre una shell con el grupo activo.
> Y siempre puedes usar `sudo docker ...` como último recurso. (`newgrp` no está
> instalado en este sistema, no lo uses.)

---

## 🟢 Arranque de cada día (2 terminales)

```bash
cd ~/Documentos/GitHub/the-show-verse
```

**Terminal 1 — datos + API:**

```bash
npm run db:up          # Postgres :5432 + Redis :6379 (idempotente; no rompe si ya están)
npm run backend:dev    # API en http://localhost:3001  (deja esta terminal abierta)
```

**Terminal 2 — web:**

```bash
npm run dev            # Web en http://localhost:3000  (deja esta terminal abierta)
```

Abre **http://localhost:3000**. Listo. Para parar: `Ctrl+C` en cada terminal.
Los contenedores puedes dejarlos corriendo (arrancan solos al encender el PC gracias
a `restart: unless-stopped`); para pararlos: `npm run db:down`.

> El primer `npm run dev` compila con Turbopack y la primera carga tarda unos
> segundos; es normal.

---

## 🔵 Primera vez / entorno nuevo (si clonas el repo en otra máquina)

```bash
# 1) Docker + Compose (Ubuntu) — ver 01-local-development.md §0 para el detalle.
# 2) Variables de entorno:
cp backend/.env.example backend/.env     # rellena claves reales: TMDB, JWT, Google…
cp .env.example .env                     # claves de la web (TMDB, OMDB…)
#    (backend/.env.local y .env.local ya existen y apuntan todo a local)
# 3) Datos + esquema:
npm run db:up
npm run backend:migrate                  # crea las 14 tablas (solo la 1ª vez)
# 4) Arrancar (ver "Arranque de cada día")
```

---

## 🎬 Funcionalidad completa

Con lo anterior la app funciona al 100% con una BBDD **vacía pero migrada**: puedes
registrarte, iniciar sesión (Google), añadir favoritos/pendientes, ver dashboards,
calendario, etc. Los datos se guardan en tu Postgres local.

### (Opcional) Trabajar con los datos de producción
Para probar con datos reales, vuelca la BBDD del NAS y restáurala en local:

```bash
# En el NAS:
docker compose -f deploy/nas/docker-compose.yml exec -T postgres \
  pg_dump -U tsv -Fc theshowverse > theshowverse.dump
# Copia theshowverse.dump a tu máquina y:
npm run db:sync-prod -- theshowverse.dump
```

> No sincroniza en vivo: es una copia puntual. Local y producción son BBDD
> independientes (mismo esquema; datos iguales solo en el momento del volcado).

---

## 🔎 Comprobar que todo está arriba

```bash
docker ps                                   # tsv-local-db y tsv-local-redis "healthy"
curl -s http://localhost:3001/health        # {"status":"ok",...}
curl -s http://localhost:3001/v1/calendar/episodes | head -c 200   # episodios
# y abre http://localhost:3000 en el navegador
```

---

## 🧰 Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm run db:up` / `db:down` | Levanta / para Postgres + Redis. |
| `npm run db:logs` | Logs de los contenedores de datos. |
| `npm run db:reset` | **Borra** los datos locales y vuelve a levantar (empezar de cero). |
| `npm run backend:migrate` | Aplica migraciones pendientes. |
| `npm run backend:dev` | API con recarga en caliente (:3001). |
| `npm run dev` | Web con recarga en caliente (:3000). |
| `npm run db:sync-prod -- fichero.dump` | Carga datos de producción en local. |
| `npm --prefix backend test` | Tests del backend. |

---

## 🛟 Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `permission denied ... docker.sock` al usar `npm run db:*` | No reiniciaste la sesión tras instalar Docker. Cierra sesión/entra, o usa `sudo docker ...`. |
| `DATABASE_URL environment variable is required` | Falta `backend/.env`. `cp backend/.env.example backend/.env`. |
| La web no llega al backend | Backend caído o `.env.local` cambiado. Debe tener `BACKEND_API_BASE_URL=http://localhost:3001`. |
| Puerto 3000/3001/5432 ocupado | Ya hay un proceso escuchando: `ss -ltnp \| grep -E ':3000\|:3001\|:5432'` y ciérralo. |
| Error de hidratación en el dashboard | Ya corregido; refresca la página (dev recarga en caliente). |
| El backend arranca pero los dashboards salen vacíos | Falta `TMDB_API_KEY` en `backend/.env`. |

---

Referencia ampliada: [01 · Desarrollo local](./01-local-development.md).
