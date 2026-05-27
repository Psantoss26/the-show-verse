#!/usr/bin/env python3
"""Deploy Ollama + update the-show-verse on NAS via SSH."""
import paramiko, sys, time, textwrap

HOST = "192.168.1.126"
USER = "pablo"
PASS = "P/s/h/26.06.02"

def run(ssh, cmd, timeout=120, show=True):
    print(f"\n$ {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    combined = (out + err).strip()
    if show and combined:
        print(combined[:3000])
    return combined

def connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, port=22, username=USER, password=PASS,
                look_for_keys=False, allow_agent=False,
                timeout=15, banner_timeout=30,
                auth_timeout=30)
    print(f"✓ Conectado a {HOST}")
    return ssh

def main():
    ssh = connect()

    # ── 1. Verificar Docker ──────────────────────────────────────────────────
    print("\n═══ 1. Verificar Docker ═══")
    run(ssh, "docker --version")
    run(ssh, "docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")

    # ── 2. Arrancar Ollama si no existe ─────────────────────────────────────
    print("\n═══ 2. Desplegar Ollama ═══")
    ollama_running = run(ssh, "docker ps --filter name=ollama --format '{{.Names}}'", show=False)

    if "ollama" in ollama_running:
        print("✓ Ollama ya está corriendo")
    else:
        print("▶ Creando contenedor Ollama...")
        run(ssh, """docker run -d \
  --name ollama \
  --restart unless-stopped \
  -p 11434:11434 \
  -v ollama_data:/root/.ollama \
  -e OLLAMA_KEEP_ALIVE=24h \
  -e OLLAMA_NUM_PARALLEL=1 \
  ollama/ollama:latest""", timeout=60)

        print("⏳ Esperando que Ollama arranque...")
        time.sleep(8)

    # ── 3. Comprobar/descargar modelo ───────────────────────────────────────
    print("\n═══ 3. Comprobar modelo qwen2.5:3b ═══")
    models = run(ssh, "docker exec ollama ollama list 2>&1", timeout=30)

    if "qwen2.5:3b" in models or "qwen2.5" in models:
        print("✓ Modelo qwen2.5:3b ya disponible")
    else:
        print("⬇ Descargando qwen2.5:3b (~2GB) — puede tardar varios minutos...")
        # Usar shell_exec para no bloquear stdout
        run(ssh, "docker exec ollama ollama pull qwen2.5:3b 2>&1", timeout=600)
        print("✓ Modelo descargado")

    # ── 4. Test rápido de Ollama ────────────────────────────────────────────
    print("\n═══ 4. Test de Ollama API ═══")
    test = run(ssh, """curl -s --max-time 10 http://localhost:11434/api/tags 2>&1 | head -c 300""", timeout=20)
    if "models" in test or "qwen" in test.lower():
        print("✓ Ollama API respondiendo correctamente")
    else:
        print("⚠ Respuesta:", test[:200])

    # ── 5. Localizar docker-compose del proyecto ─────────────────────────────
    print("\n═══ 5. Localizar proyecto en NAS ═══")
    compose_path = run(ssh, "find / -name docker-compose.yml -path '*/the-show-verse*' 2>/dev/null | head -5", show=True, timeout=30)
    
    if not compose_path.strip():
        # Intentar rutas comunes
        for path in ["/nas-deploy", "/volume1/docker/the-show-verse", "/data/docker/the-show-verse", "/home/pablo/the-show-verse"]:
            result = run(ssh, f"ls {path}/docker-compose.yml 2>/dev/null", show=False)
            if "docker-compose.yml" in result:
                compose_path = f"{path}/docker-compose.yml"
                break

    compose_dir = ""
    if compose_path.strip():
        # Tomar la primera línea
        first_path = compose_path.strip().split('\n')[0].strip()
        compose_dir = first_path.rsplit("/", 1)[0] if "/" in first_path else ""
        print(f"✓ Proyecto encontrado en: {compose_dir}")
    else:
        print("⚠ No se encontró docker-compose.yml, buscando contenedor the-show-verse...")

    # ── 6. Ver variables de entorno del contenedor actual ────────────────────
    print("\n═══ 6. Estado del contenedor the-show-verse ═══")
    env_current = run(ssh, "docker inspect the-show-verse --format '{{range .Config.Env}}{{.}}\\n{{end}}' 2>&1 | grep -E 'OLLAMA|WATCH_NEXT|AI' | head -10")

    # ── 7. Actualizar variables de entorno vía docker commit + recreate ──────
    print("\n═══ 7. Configurar OLLAMA_BASE_URL en the-show-verse ═══")
    
    # Obtener la imagen actual
    current_image = run(ssh, "docker inspect the-show-verse --format '{{.Config.Image}}' 2>&1", show=False).strip()
    print(f"Imagen actual: {current_image}")
    
    # Parar el contenedor
    run(ssh, "docker stop the-show-verse 2>&1 || true", timeout=30)
    run(ssh, "docker rm the-show-verse 2>&1 || true", timeout=20)
    
    # Obtener todos los puertos y volúmenes del contenedor original
    # Recrear con las variables de Ollama
    if current_image:
        print(f"▶ Recreando the-show-verse con soporte Ollama...")
        # Obtener .env si existe
        env_file = ""
        if compose_dir:
            env_exists = run(ssh, f"ls {compose_dir}/.env 2>/dev/null", show=False)
            if ".env" in env_exists:
                env_file = f"--env-file {compose_dir}/.env"

        run(ssh, f"""docker run -d \
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
  {current_image}""", timeout=30)
        print("✓ Contenedor recreado con Ollama configurado")
    else:
        print("⚠ No se pudo obtener la imagen. Usando docker compose...")
        if compose_dir:
            run(ssh, f"""cd {compose_dir} && \
  OLLAMA_BASE_URL=http://ollama:11434 \
  OLLAMA_MODEL=qwen2.5:3b \
  WATCH_NEXT_AI_PROVIDER=ollama \
  docker compose up -d app""", timeout=60)

    # ── 8. Esperar y verificar ────────────────────────────────────────────────
    print("\n═══ 8. Verificación final ═══")
    time.sleep(8)
    
    status = run(ssh, "docker ps --filter name=the-show-verse --format '{{.Names}}: {{.Status}}'")
    status_ollama = run(ssh, "docker ps --filter name=ollama --format '{{.Names}}: {{.Status}}'")
    
    # Test API
    ai_health = run(ssh, "curl -s --max-time 15 http://localhost:3000/api/ai/health 2>&1", timeout=25)
    print("\nAI Health:", ai_health[:500])
    
    if "ollama" in ai_health and ('"ok":true' in ai_health or '"configured":true' in ai_health):
        print("\n✅ ¡ÉXITO! Ollama integrado correctamente en the-show-verse")
    else:
        watch_test = run(ssh, 'curl -s --max-time 20 -X POST http://localhost:3000/api/ai/watch-next -H "Content-Type: application/json" -d \'{"message":"ciencia ficción"}\' 2>&1 | python3 -c "import sys,json; d=json.load(sys.stdin); print(\'mode:\', d.get(\'mode\')); print(\'provider:\', d.get(\'provider\')); print(\'aiEnabled:\', d.get(\'contextSummary\',{}).get(\'aiEnabled\'))" 2>&1', timeout=60)
        print("\nWatch-next test:", watch_test)

    ssh.close()
    print("\n✓ Conexión SSH cerrada")

if __name__ == "__main__":
    main()
