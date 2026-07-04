# 05 · GitHub Actions (CI/CD)

Despliegue automático al NAS mediante un **runner self-hosted** que corre en el
propio NAS. En cada `push` a `main` (o manualmente) se validan los tests del backend
y se reconstruye/levanta el stack de `deploy/nas`.

- Workflow: [`.github/workflows/deploy-nas.yml`](../../.github/workflows/deploy-nas.yml)
- Runner: servicio `github-runner` en `deploy/nas/docker-compose.yml`
  (imagen `myoung34/github-runner`).

## El runner self-hosted

Definido en el compose:

```yaml
github-runner:
  image: myoung34/github-runner:latest
  env_file: [./runner.env]
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock   # habla con el Docker del host
    - runner-data:/home/runner                     # registro persistente
    - /volume4/docker/theshowverse:/nas-deploy      # carpeta de despliegue
```

Configúralo en `deploy/nas/runner.env` (ver `runner.env.example`):

```bash
REPO_URL=https://github.com/TU_USUARIO/the-show-verse
RUNNER_SCOPE=repo
ACCESS_TOKEN=ghp_xxx          # PAT (classic) con scope `repo`
RUNNER_NAME=nas-ugreen
LABELS=self-hosted,nas,linux  # el workflow selecciona por estas etiquetas
RUNNER_WORKDIR=/tmp/runner/work
```

Al arrancar, el contenedor se **auto-registra** en el repo con esas etiquetas.
Verifica en GitHub → *Settings → Actions → Runners* que aparece *Idle*.

> El `ACCESS_TOKEN` es un secreto: vive solo en `deploy/nas/runner.env` (gitignored).
> Con montar `docker.sock`, el runner puede construir imágenes y manejar el stack
> del host; trátalo como componente de confianza.

## El workflow

`runs-on: [self-hosted, nas]` fija la ejecución en el NAS. Dos jobs:

1. **test** — `actions/setup-node@v4` (Node 22) → `npm --prefix backend ci` →
   `npm --prefix backend test`. Si falla, no se despliega.
2. **deploy** (`needs: test`):
   - `actions/checkout@v4`.
   - **rsync** del código a `/nas-deploy`, **excluyendo** `.git`, `node_modules` y
     los ficheros `deploy/nas/.env` / `deploy/nas/*.env` (los secretos persistentes
     del NAS **no** se tocan).
   - `docker compose up -d --build` **listando los servicios** (`postgres redis
     backend web cloudflared ollama`) para **no** recrear el propio `github-runner`
     mientras ejecuta el job.
   - `docker image prune -f`.

```yaml
concurrency:
  group: deploy-nas
  cancel-in-progress: false   # un despliegue a la vez; no cortar uno en curso
```

## Prerrequisitos en el NAS

- Los ficheros de entorno ya creados en `/nas-deploy/deploy/nas/` (`.env`,
  `backend.env`, `web.env`) — ver [03](./03-nas-selfhosting.md).
- El runner arrancado y registrado (servicio `github-runner`).
- Docker + plugin Compose disponibles para el usuario del runner (vía `docker.sock`).

## Disparar un despliegue

- **Automático**: `git push` a `main`.
- **Manual**: pestaña *Actions → Deploy to NAS → Run workflow* (`workflow_dispatch`).

## Diagnóstico

| Problema | Revisar |
|---|---|
| El workflow queda *Queued* para siempre | El runner no está *Idle* / etiquetas no coinciden con `runs-on`. |
| `rsync: command not found` | El paso lo instala (`apt-get install rsync`); requiere sudo en el runner. |
| El build de la web falla por memoria | `NODE_OPTIONS=--max-old-space-size=4096` ya está en `Dockerfile.web`; sube RAM/swap del NAS si persiste. |
| Cambió una `NEXT_PUBLIC_*` y no se refleja | Hay que **reconstruir** la web (el `--build` del workflow lo hace). |
| El deploy mató al runner | No incluyas `github-runner` en la lista de `docker compose up` (el workflow ya lo evita). |
