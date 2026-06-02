#!/usr/bin/env python3
"""Deploy Ollama + update the-show-verse on NAS.

This helper is designed to run directly on the NAS or from a host that can
access the NAS Docker socket. If SSH is required, provide credentials via
environment variables and never hardcode them in source control.
"""
import os
import shlex
import subprocess
import time

NAS_SSH_HOST = os.environ.get("NAS_SSH_HOST", "").strip()
NAS_SSH_USER = os.environ.get("NAS_SSH_USER", "").strip()
NAS_SSH_PASS = os.environ.get("NAS_SSH_PASS", "").strip()

USE_SSH = bool(NAS_SSH_HOST and NAS_SSH_USER and NAS_SSH_PASS)
SSH_CLIENT = None


def quote(value):
    return shlex.quote(str(value))


def run_local(cmd, timeout=120, show=True):
    print(f"\n$ {cmd}")
    proc = subprocess.run(
        cmd,
        shell=True,
        capture_output=True,
        text=True,
        timeout=timeout,
        env=os.environ,
    )
    combined = (proc.stdout + proc.stderr).strip()
    if show and combined:
        print(combined[:3000])
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {cmd}\n{combined}")
    return combined


def ensure_ssh():
    global SSH_CLIENT
    if SSH_CLIENT:
        return SSH_CLIENT

    try:
        import paramiko
    except ImportError as exc:
        raise RuntimeError(
            "SSH support requires paramiko. Install it or run this script locally."
        ) from exc

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(
        NAS_SSH_HOST,
        port=22,
        username=NAS_SSH_USER,
        password=NAS_SSH_PASS,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
        banner_timeout=30,
        auth_timeout=30,
    )
    print(f"✓ Connected to NAS host: {NAS_SSH_HOST}")
    SSH_CLIENT = ssh
    return ssh


def run_remote(cmd, timeout=120, show=True):
    ssh = ensure_ssh()
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    combined = (out + err).strip()
    if show and combined:
        print(combined[:3000])
    return combined


def run(cmd, timeout=120, show=True):
    return run_remote(cmd, timeout=timeout, show=show) if USE_SSH else run_local(cmd, timeout=timeout, show=show)


def close_ssh():
    global SSH_CLIENT
    if SSH_CLIENT:
        SSH_CLIENT.close()
        SSH_CLIENT = None
        print("\n✓ SSH connection closed")


def find_compose_path():
    attempts = [
        "find / -name docker-compose.yml -path '*/the-show-verse*' 2>/dev/null | head -5",
        "find / -maxdepth 4 -path '*/docker-compose.yml' 2>/dev/null | grep 'the-show-verse' | head -5",
    ]

    for cmd in attempts:
        try:
            result = run(cmd, show=False, timeout=60)
        except Exception:
            result = ""
        if result.strip():
            return result.strip().splitlines()[0].strip()

    for path in ["/nas-deploy", "/volume1/docker/the-show-verse", "/data/docker/the-show-verse", "/home/pablo/the-show-verse"]:
        try:
            result = run(f"ls {quote(path)}/docker-compose.yml 2>/dev/null", show=False)
        except Exception:
            result = ""
        if "docker-compose.yml" in result:
            return f"{path}/docker-compose.yml"

    return ""


def main():
    if USE_SSH:
        print("✓ SSH mode detected. Connecting to NAS...")
        ensure_ssh()
    else:
        print("✓ Local mode detected. Running against local Docker.")

    try:
        print("\n═══ 1. Verificar Docker ═══")
        run("docker --version")
        run("docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")

        print("\n═══ 2. Desplegar Ollama ═══")
        ollama_running = run("docker ps --filter name=ollama --format '{{.Names}}'", show=False)

        if "ollama" in ollama_running:
            print("✓ Ollama ya está corriendo")
        else:
            print("▶ Creando contenedor Ollama...")
            run(
                """docker run -d \
  --name ollama \
  --restart unless-stopped \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  -e OLLAMA_KEEP_ALIVE=24h \
  -e OLLAMA_NUM_PARALLEL=1 \
  ollama/ollama:latest""",
                timeout=60,
            )
            print("⏳ Esperando que Ollama arranque...")
            time.sleep(8)

        print("\n═══ 3. Comprobar modelo qwen2.5:3b ═══")
        models = run("docker exec ollama ollama list 2>&1", timeout=30)

        if "qwen2.5:3b" in models or "qwen2.5" in models:
            print("✓ Modelo qwen2.5:3b ya disponible")
        else:
            print("⬇ Descargando qwen2.5:3b (~2GB) — puede tardar varios minutos...")
            run("docker exec ollama ollama pull qwen2.5:3b 2>&1", timeout=600)
            print("✓ Modelo descargado")

        print("\n═══ 4. Test de Ollama API ═══")
        test = run(
            "curl -s --max-time 10 http://localhost:11434/api/tags 2>&1 | head -c 300",
            timeout=20,
        )
        if "models" in test or "qwen" in test.lower():
            print("✓ Ollama API respondiendo correctamente")
        else:
            print("⚠ Respuesta:", test[:200])

        print("\n═══ 5. Localizar proyecto en NAS ═══")
        compose_path = find_compose_path()

        compose_dir = ""
        if compose_path:
            compose_dir = compose_path.rsplit("/", 1)[0]
            print(f"✓ Proyecto encontrado en: {compose_dir}")
        else:
            print("⚠ No se encontró docker-compose.yml, buscando contenedor the-show-verse...")

        print("\n═══ 6. Estado del contenedor the-show-verse ═══")
        run(
            "docker inspect the-show-verse --format '{{range .Config.Env}}{{.}}\\n{{end}}' 2>&1 | grep -E 'OLLAMA|WATCH_NEXT|AI' | head -10",
        )

        print("\n═══ 7. Configurar OLLAMA_BASE_URL en the-show-verse ═══")
        current_image = run(
            "docker inspect the-show-verse --format '{{.Config.Image}}' 2>&1",
            show=False,
        ).strip()
        print(f"Imagen actual: {current_image}")

        run("docker stop the-show-verse 2>&1 || true", timeout=30)
        run("docker rm the-show-verse 2>&1 || true", timeout=20)

        if current_image:
            print("▶ Recreando the-show-verse con soporte Ollama...")
            env_file = ""
            if compose_dir:
                env_exists = run(f"ls {quote(compose_dir)}/.env 2>/dev/null", show=False)
                if ".env" in env_exists:
                    env_file = f"--env-file {quote(compose_dir)}/.env"

            run(
                f"""docker run -d \
  --name the-show-verse \
  --restart unless-stopped \
  -p 3000:3000 \
  {env_file} \
  -e NODE_ENV=production \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e OLLAMA_BASE_URL=http://ollama:11434 \
  -e OLLAMA_MODEL=qwen2.5:3b \
  -e WATCH_NEXT_AI_PROVIDER=ollama \
  --link ollama:ollama \
  {current_image}""",
                timeout=30,
            )
            print("✓ Contenedor recreado con Ollama configurado")
        elif compose_dir:
            print("⚠ No se pudo obtener la imagen. Usando docker compose...")
            run(
                f"cd {quote(compose_dir)} && \
  OLLAMA_BASE_URL=http://ollama:11434 \
  OLLAMA_MODEL=qwen2.5:3b \
  WATCH_NEXT_AI_PROVIDER=ollama \
  docker compose up -d app",
                timeout=60,
            )

        print("\n═══ 8. Verificación final ═══")
        time.sleep(8)

        run("docker ps --filter name=the-show-verse --format '{{.Names}}: {{.Status}}'")
        run("docker ps --filter name=ollama --format '{{.Names}}: {{.Status}}'")

        ai_health = run("curl -s --max-time 15 http://localhost:3000/api/ai/health 2>&1", timeout=25)
        print("\nAI Health:", ai_health[:500])

        if "ollama" in ai_health and ('"ok":true' in ai_health or '"configured":true' in ai_health):
            print("\n✅ ¡ÉXITO! Ollama integrado correctamente en the-show-verse")
        else:
            watch_test = run(
                'curl -s --max-time 20 -X POST http://localhost:3000/api/ai/watch-next -H "Content-Type: application/json" -d \'{"message":"ciencia ficción"}\' 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(\'mode:\', d.get(\'mode\')); print(\'provider:\', d.get(\'provider\')); print(\'aiEnabled:\', d.get(\'contextSummary\',{}).get(\'aiEnabled\'))" 2>&1',
                timeout=60,
            )
            print("\nWatch-next test:", watch_test)
    finally:
        if USE_SSH:
            close_ssh()


if __name__ == "__main__":
    main()
