#!/usr/bin/env python3
"""
fix_runner.py — Diagnostica y repara el runner self-hosted de GitHub Actions en el NAS.

Uso:
    python3 scripts/fix_runner.py

O con variables de entorno para no escribir la contraseña:
    NAS_SSH_HOST=192.168.1.126 NAS_SSH_USER=pablo NAS_SSH_PASS=tu_pass \
        python3 scripts/fix_runner.py
"""
import getpass
import os
import sys
import time

# ── Credenciales SSH ──────────────────────────────────────────────────────────
NAS_HOST = os.environ.get("NAS_SSH_HOST", "192.168.1.126").strip()
NAS_USER = os.environ.get("NAS_SSH_USER", "").strip()
NAS_PASS = os.environ.get("NAS_SSH_PASS", "").strip()

SSH_CLIENT = None


def banner(msg):
    print(f"\n{'═' * 55}")
    print(f"  {msg}")
    print(f"{'═' * 55}")


def get_credentials():
    global NAS_HOST, NAS_USER, NAS_PASS
    print("\n🔧 Fix GitHub Actions Runner — NAS UGREEN")
    print("─" * 45)

    if not NAS_HOST:
        NAS_HOST = input(f"  NAS IP/host [{NAS_HOST or '192.168.1.126'}]: ").strip() or "192.168.1.126"
    else:
        print(f"  NAS host: {NAS_HOST}")

    if not NAS_USER:
        NAS_USER = input("  SSH usuario: ").strip()
    else:
        print(f"  SSH usuario: {NAS_USER}")

    if not NAS_PASS:
        NAS_PASS = getpass.getpass("  SSH contraseña: ")


def connect():
    global SSH_CLIENT
    try:
        import paramiko
    except ImportError:
        print("\n❌ Falta paramiko. Instálalo con:")
        print("   pip install paramiko")
        sys.exit(1)

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"\n🔌 Conectando a {NAS_USER}@{NAS_HOST}...")
    ssh.connect(
        NAS_HOST,
        port=22,
        username=NAS_USER,
        password=NAS_PASS,
        look_for_keys=False,
        allow_agent=False,
        timeout=15,
        banner_timeout=30,
        auth_timeout=30,
    )
    print("✓ Conectado al NAS")
    SSH_CLIENT = ssh
    return ssh


def run(cmd, timeout=60, show=True, allow_fail=False):
    """Ejecuta un comando en el NAS via SSH."""
    if show:
        print(f"\n$ {cmd}")
    _, stdout, stderr = SSH_CLIENT.exec_command(cmd, timeout=timeout, get_pty=True)
    out = stdout.read().decode(errors="replace")
    err = stderr.read().decode(errors="replace")
    combined = (out + err).strip()
    if show and combined:
        print(combined[:4000])
    exit_code = stdout.channel.recv_exit_status()
    if not allow_fail and exit_code != 0 and show:
        print(f"  (exit code: {exit_code})")
    return combined, exit_code


def find_runner_dir():
    """Busca el directorio donde está instalado el runner."""
    banner("1. Buscando directorio del runner")

    search_paths = [
        f"/home/{NAS_USER}/actions-runner",
        f"/home/{NAS_USER}/.github-runner",
        "/opt/actions-runner",
        "/root/actions-runner",
        "/volume1/homes/admin/actions-runner",
        f"/volume1/homes/{NAS_USER}/actions-runner",
    ]

    # Búsqueda rápida en paths conocidos
    for path in search_paths:
        result, code = run(f"test -f {path}/run.sh && echo FOUND", show=False, allow_fail=True)
        if "FOUND" in result:
            print(f"✓ Runner encontrado en: {path}")
            return path

    # Búsqueda más amplia si no encontramos nada
    print("  Buscando en todo el sistema (puede tardar unos segundos)...")
    result, _ = run(
        "find /home /opt /root /volume1 -name 'run.sh' -path '*actions-runner*' 2>/dev/null | head -5",
        show=False,
        allow_fail=True,
        timeout=30,
    )
    if result.strip():
        path = result.strip().splitlines()[0].rsplit("/", 1)[0]
        print(f"✓ Runner encontrado en: {path}")
        return path

    return None


def check_runner_status(runner_dir):
    """Comprueba si el runner está corriendo."""
    banner("2. Estado actual del runner")

    # Verificar via systemd
    result, code = run(
        "systemctl list-units --type=service --all 2>/dev/null | grep -i 'runner\\|actions' | head -10",
        allow_fail=True,
    )

    # Verificar proceso
    proc_result, _ = run(
        "ps aux 2>/dev/null | grep -i 'Runner.Listener\\|actions-runner' | grep -v grep | head -5",
        allow_fail=True,
    )

    if not proc_result.strip():
        print("\n⚠️  El runner NO está corriendo (proceso no encontrado)")
        return False
    else:
        print("\n✓ Proceso del runner detectado:")
        print(proc_result[:500])
        return True


def find_service_name(runner_dir):
    """Encuentra el nombre del servicio systemd del runner."""
    result, _ = run(
        "systemctl list-units --type=service --all 2>/dev/null | grep -i runner | awk '{print $1}' | head -5",
        show=False,
        allow_fail=True,
    )
    if result.strip():
        service = result.strip().splitlines()[0].strip()
        if service:
            return service

    # Buscar en el directorio del runner
    if runner_dir:
        result, _ = run(
            f"ls {runner_dir}/*.service 2>/dev/null | head -3",
            show=False,
            allow_fail=True,
        )
        if result.strip():
            return result.strip().splitlines()[0].strip().split("/")[-1]

    return None


def install_as_service(runner_dir):
    """Instala el runner como servicio systemd para auto-inicio."""
    banner("3. Instalando runner como servicio systemd")

    # El runner de GitHub tiene un script de instalación incluido
    result, code = run(
        f"test -f {runner_dir}/svc.sh && echo HAS_SVC",
        show=False,
        allow_fail=True,
    )

    if "HAS_SVC" in result:
        print("  Usando svc.sh del runner para instalar servicio...")
        run(f"cd {runner_dir} && sudo ./svc.sh install {NAS_USER} 2>&1", allow_fail=True, timeout=30)
        run(f"cd {runner_dir} && sudo ./svc.sh start 2>&1", allow_fail=True, timeout=30)
        run(f"cd {runner_dir} && sudo ./svc.sh status 2>&1", allow_fail=True)
        return True
    else:
        # Crear servicio systemd manualmente
        print("  Creando servicio systemd manualmente...")
        service_content = f"""[Unit]
Description=GitHub Actions Runner (nas-showverse)
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User={NAS_USER}
WorkingDirectory={runner_dir}
ExecStart={runner_dir}/run.sh
Restart=always
RestartSec=10
KillMode=process
KillSignal=SIGTERM
TimeoutStopSec=5min

[Install]
WantedBy=multi-user.target
"""
        # Escribir el archivo de servicio
        escaped = service_content.replace("'", "'\\''")
        run(
            f"echo '{escaped}' | sudo tee /etc/systemd/system/github-actions-runner.service > /dev/null",
            show=False,
            allow_fail=True,
        )
        run("sudo systemctl daemon-reload", allow_fail=True)
        run("sudo systemctl enable github-actions-runner", allow_fail=True)
        run("sudo systemctl start github-actions-runner", allow_fail=True)
        return True


def restart_runner(runner_dir):
    """Intenta reiniciar el runner por todos los métodos disponibles."""
    banner("3. Reiniciando el runner")

    # Método 1: systemd service con nombre estándar del runner de GitHub
    service_name = find_service_name(runner_dir)
    if service_name:
        print(f"  Servicio encontrado: {service_name}")
        run(f"sudo systemctl restart {service_name}", allow_fail=True)
        time.sleep(3)
        run(f"sudo systemctl status {service_name}", allow_fail=True)
        return True

    # Método 2: svc.sh del runner
    if runner_dir:
        result, code = run(
            f"test -f {runner_dir}/svc.sh && echo HAS_SVC",
            show=False,
            allow_fail=True,
        )
        if "HAS_SVC" in result:
            print("  Reiniciando via svc.sh...")
            run(f"cd {runner_dir} && sudo ./svc.sh stop 2>&1", allow_fail=True)
            time.sleep(2)
            run(f"cd {runner_dir} && sudo ./svc.sh start 2>&1", allow_fail=True)
            return True

    # Método 3: matar proceso anterior y relanzar en background
    if runner_dir:
        print("  Reiniciando proceso en background...")
        run("pkill -f 'Runner.Listener' 2>/dev/null || true", show=False, allow_fail=True)
        time.sleep(2)
        run(
            f"cd {runner_dir} && nohup ./run.sh > /tmp/runner.log 2>&1 &",
            allow_fail=True,
        )
        time.sleep(5)
        return True

    return False


def verify_runner_online(runner_dir):
    """Verifica que el runner esté corriendo correctamente."""
    banner("4. Verificación final")

    time.sleep(5)

    # Comprobar proceso
    result, _ = run(
        "ps aux 2>/dev/null | grep -i 'Runner.Listener' | grep -v grep | head -3",
        allow_fail=True,
    )

    if result.strip():
        print("\n✅ Runner process está activo")
    else:
        print("\n⚠️  Proceso Runner.Listener no detectado")

    # Mostrar log reciente
    if runner_dir:
        result, _ = run(
            f"ls {runner_dir}/_diag/ 2>/dev/null | sort | tail -1",
            show=False,
            allow_fail=True,
        )
        if result.strip():
            log_file = f"{runner_dir}/_diag/{result.strip()}"
            run(f"tail -20 {log_file} 2>/dev/null", allow_fail=True)

    # Comprobar log de nohup si aplica
    run("tail -20 /tmp/runner.log 2>/dev/null || true", show=False, allow_fail=True)

    print("\n📋 Para confirmar que el runner está online, ve a:")
    print("   https://github.com/Psantoss26/the-show-verse/settings/actions/runners")
    print("   El runner 'nas-showverse' debe aparecer en verde (Online)")


def main():
    try:
        get_credentials()
        connect()

        runner_dir = find_runner_dir()

        if not runner_dir:
            banner("❌ Runner no instalado")
            print("\nEl runner de GitHub Actions no está instalado en el NAS.")
            print("\nPasos para instalarlo desde el NAS:")
            print("  1. Ve a: https://github.com/Psantoss26/the-show-verse/settings/actions/runners/new")
            print("  2. Selecciona: Linux / x64")
            print("  3. Sigue las instrucciones que GitHub te da")
            print("  4. En 'labels' pon: nas-showverse")
            print(f"  5. Instala en: /home/{NAS_USER}/actions-runner/")
            print("\nDespués vuelve a ejecutar este script para configurarlo como servicio.")
            sys.exit(1)

        is_running = check_runner_status(runner_dir)

        if is_running:
            print("\n✅ El runner ya estaba corriendo. Si los jobs siguen en queue,")
            print("   verifica en GitHub que el runner aparece como 'Online'.")
            print("   Si aparece offline, reiniciamos de todas formas...")
            user_input = input("\n¿Reiniciar de todas formas? [s/N]: ").strip().lower()
            if user_input not in ("s", "si", "sí", "y", "yes"):
                print("Saliendo sin cambios.")
                return

        # Si hay servicio systemd, intentar reiniciar
        service_name = find_service_name(runner_dir)
        if service_name:
            restarted = restart_runner(runner_dir)
        else:
            # No hay servicio → instalarlo primero
            print("\n⚠️  El runner no está configurado como servicio systemd.")
            print("    Lo instalaremos para que se reinicie automáticamente.")
            restarted = install_as_service(runner_dir)

        if restarted:
            verify_runner_online(runner_dir)
        else:
            print("\n❌ No se pudo reiniciar el runner automáticamente.")
            print("   Conéctate al NAS manualmente y ejecuta:")
            print(f"   cd {runner_dir} && ./run.sh")

    except KeyboardInterrupt:
        print("\n\nCancelado por el usuario.")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)
    finally:
        if SSH_CLIENT:
            SSH_CLIENT.close()


if __name__ == "__main__":
    main()
