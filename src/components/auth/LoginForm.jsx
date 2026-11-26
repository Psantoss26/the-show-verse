"use client";

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { motion, AnimatePresence } from "framer-motion";
import { AlertCircle, Loader2, LogIn, UserPlus, Mail, Lock, User, UserCheck, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  LIQUID_GLASS_MODAL_BUTTON,
  LIQUID_GLASS_MODAL_FIELD,
  LIQUID_GLASS_MODAL_HEADER,
  LIQUID_GLASS_PANEL,
} from "@/lib/ui/liquidGlass";
import {
  abrirLoginEnNavegadorNativo,
  empezarLoginPorNavegador,
  logToApp,
  requestNativeGoogleIdToken,
  useAndroidApp,
} from "@/lib/android/appBridge";
import GoogleSignInButton, { GoogleBrandButton } from "@/components/auth/GoogleSignInButton";
import { appGoogleNextStep, googleRedirectHref } from "@/lib/auth/googleSignIn";

function sanitizeNextPath(value) {
  const next = value || "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/api/")) return "/";
  return next;
}

function getAuthErrorMessage(error, mode) {
  const raw = String(error?.message || "").toLowerCase();
  if (error?.payload?.code === "password_not_set") {
    return "Esta cuenta se creó con Google y todavía no tiene contraseña. Entra con Google y créala en Ajustes › Preferencias › Correo y contraseña.";
  }
  if (error?.status === 401) return "Usuario, email o contraseña incorrectos.";
  if (error?.status === 409 || raw.includes("already")) {
    return "Ya existe una cuenta con ese email o nombre de usuario.";
  }
  if (error?.status === 400 || raw.includes("validation")) {
    return mode === "register"
      ? "Revisa email, usuario y contraseña. La contraseña debe tener al menos 8 caracteres."
      : "Introduce tu email o usuario y la contraseña.";
  }
  if (error?.status === 503) {
    return "El backend no está disponible ahora mismo.";
  }
  return error?.message || "No se pudo completar la autenticación.";
}

function getGoogleErrorMessage(value) {
  if (!value) return "";
  if (value === "missing_id_token" || value === "invalid_body") {
    return "Google no devolvió la cuenta elegida. Inténtalo de nuevo.";
  }
  if (value === "missing_config") {
    return "Google Login no está configurado todavía.";
  }
  if (value === "google_popup_failed" || value === "invalid_grant") {
    return "La ventana de Google no devolvió la cuenta. Inténtalo de nuevo.";
  }
  if (value === "redirect_uri_mismatch" || value === "origin_mismatch") {
    return "Google no tiene autorizado este dominio. Añádelo en los orígenes de JavaScript del cliente OAuth.";
  }
  if (value === "invalid_state") {
    return "No se pudo verificar la sesión de Google. Inténtalo de nuevo.";
  }
  if (value === "access_denied") {
    return "Has cancelado el inicio de sesión con Google.";
  }
  if (value === "backend_auth_failed") {
    return "Google validó tu cuenta, pero no se pudo iniciar sesión en Show Verse.";
  }
  if (value === "backend_route_not_found") {
    return "Show Verse no encuentra la ruta de login en el backend. Revisa BACKEND_API_BASE_URL.";
  }
  if (value === "backend_cors_origin") {
    return "El backend no permite este dominio. Añade la URL actual a FRONTEND_URLS en el backend (deploy/nas/backend.env).";
  }
  if (value === "backend_google_config") {
    return "Falta GOOGLE_CLIENT_ID en el backend. Añádelo en deploy/nas/backend.env y reinicia el backend.";
  }
  if (value === "backend_missing_config") {
    return "El frontend no encuentra BACKEND_API_BASE_URL para completar el login.";
  }
  if (value === "backend_unavailable") {
    return "El backend no está disponible. Arráncalo en local o revisa BACKEND_API_BASE_URL.";
  }
  if (value === "google_audience_mismatch") {
    return "El GOOGLE_CLIENT_ID del backend no coincide con el cliente OAuth usado por el frontend.";
  }
  if (value === "google_token_rejected") {
    return "El backend rechazó el token de Google. Revisa que el frontend y el backend usen el mismo GOOGLE_CLIENT_ID.";
  }
  if (value === "backend_server_error") {
    return "El backend falló al crear la sesión. Revisa los logs del backend para /v1/auth/google.";
  }
  if (value === "google_email_not_verified") {
    return "Tu cuenta de Google no tiene el email verificado.";
  }
  return "No se pudo completar el inicio de sesión con Google.";
}

// Campos con el cristal de los modales de la ficha; el anillo de foco, azul.
const fieldClass = `${LIQUID_GLASS_MODAL_FIELD} focus:ring-sky-500/40`;

export default function LoginForm({ next: nextProp, googleClientId = "" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, loginWithGoogle, register } = useAuth();
  const inAndroidApp = useAndroidApp();

  const [mode, setMode] = useState("login");
  const [loading, setLoading] = useState(false);
  // Canje del idToken de Google en curso: tapa el formulario con «Entrando con
  // Google…» hasta que la sesión está en el contexto y se navega.
  const [googleBusy, setGoogleBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: "",
    username: "",
    displayName: "",
    password: "",
  });

  const next = useMemo(() => {
    return sanitizeNextPath(nextProp || searchParams?.get("next") || "/");
  }, [nextProp, searchParams]);
  const googleError = getGoogleErrorMessage(searchParams?.get("google_error"));
  const visibleError = err || googleError;
  const googleAuthHref = googleRedirectHref(next);

  // Abre el login en el navegador dejando abierta una ENTREGA en el servidor:
  // al volver a la app, la sesión se recoge de ahí. No depende de que el
  // navegador consiga devolver el control.
  const abrirLoginEnNavegador = useCallback(() => {
    const id = empezarLoginPorNavegador();
    const url = googleRedirectHref(next, { app: id || undefined });

    // Lo abre el NATIVO, que se queda vigilando y devuelve la app al frente en
    // cuanto la sesión está lista: así no hay que pulsar nada para volver. Si la
    // app instalada no conoce el método, se navega como siempre.
    if (abrirLoginEnNavegadorNativo(new URL(url, window.location.origin).toString(), id)) {
      return;
    }
    window.location.href = url;
  }, [next]);

  // Credencial de Google —`{ code }` de la ventana de la web o idToken del
  // selector nativo— → sesión en el contexto → destino. La página de destino
  // ya se pinta con la sesión.
  const entrarConIdToken = useCallback(
    async (credential) => {
      setGoogleBusy(true);
      setErr("");
      try {
        await loginWithGoogle(credential);
        router.replace(next);
        // Sin desbloquear: el formulario se va con la navegación.
      } catch (e) {
        setGoogleBusy(false);
        setErr(
          e?.status === 503 && !e?.payload?.error
            ? getGoogleErrorMessage("backend_unavailable")
            : getGoogleErrorMessage(e?.payload?.error || "backend_auth_failed"),
        );
      }
    },
    [loginWithGoogle, next, router],
  );

  const mostrarErrorDeGoogle = useCallback((code) => {
    setErr(getGoogleErrorMessage(code) || getGoogleErrorMessage("google_popup_failed"));
  }, []);

  // APP DE ANDROID. Primero el selector de cuentas del sistema (Credential
  // Manager). Si el usuario lo cierra, no se hace nada; si falla de verdad
  // —sin cuentas, sin Play Services, certificado no registrado—, se abre el
  // login en el navegador con la recogida de sesión de siempre.
  const handleAppGoogleLogin = useCallback(async () => {
    if (googleBusy) return;
    setErr("");
    setGoogleBusy(true);
    const resultado = await requestNativeGoogleIdToken();
    const paso = appGoogleNextStep(resultado);
    if (paso === "exchange") {
      logToApp("Google: selector nativo ✓, canjeando el token");
      await entrarConIdToken(resultado.idToken);
      return;
    }
    setGoogleBusy(false);
    if (paso === "stay") return;
    logToApp(`Google: selector nativo no disponible (${resultado?.error || "?"}), uso el navegador`);
    abrirLoginEnNavegador();
  }, [abrirLoginEnNavegador, entrarConIdToken, googleBusy]);

  const updateField = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    if (loading) return;

    setLoading(true);
    setErr("");

    try {
      if (mode === "register") {
        await register({
          email: form.email.trim(),
          username: form.username.trim(),
          displayName: form.displayName.trim() || undefined,
          password: form.password,
        });
      } else {
        await login({
          identifier: form.email.trim(),
          password: form.password,
        });
      }

      router.replace(next);
      router.refresh();
    } catch (e) {
      setErr(getAuthErrorMessage(e, mode));
    } finally {
      setLoading(false);
    }
  };

  const isRegister = mode === "register";

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      className={`w-full max-w-[380px] overflow-hidden rounded-[2rem] ${LIQUID_GLASS_PANEL}`}
    >
      <div className={`flex flex-col items-center px-6 pb-6 pt-10 ${LIQUID_GLASS_MODAL_HEADER}`}>
        <div className="relative mb-4 flex h-24 w-48 items-center justify-center">
          <img
            src="/logo-TSV-sinFondo.png"
            alt="The Show Verse"
            className="h-full w-auto object-contain scale-[1.6]"
          />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight drop-shadow-md">
          {isRegister ? "Crear cuenta" : "Iniciar sesión"}
        </h1>
      </div>

      <div className="px-6 pb-10">
        <div className="mb-5">
          {inAndroidApp ? (
            <GoogleBrandButton onClick={handleAppGoogleLogin} busy={googleBusy}>
              {isRegister ? "Registrarse con Google" : "Continuar con Google"}
            </GoogleBrandButton>
          ) : (
            <GoogleSignInButton
              clientId={googleClientId}
              mode={mode}
              busy={googleBusy}
              onCredential={entrarConIdToken}
              onError={mostrarErrorDeGoogle}
              fallbackHref={googleAuthHref}
              label={isRegister ? "Registrarse con Google" : "Continuar con Google"}
            />
          )}
        </div>

        <div className="mb-5 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-white/[0.06]" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            o
          </span>
          <div className="h-px flex-1 bg-white/[0.06]" />
        </div>

        <div className="relative mb-6 grid grid-cols-2 rounded-2xl bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => {
              setMode("login");
              setErr("");
            }}
            className={`relative z-10 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
              !isRegister ? "text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            {!isRegister && (
              <motion.div
                layoutId="activeTabIndicator"
                className={`absolute inset-0 ${LIQUID_GLASS_MODAL_BUTTON}`}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
              />
            )}
            <span className="relative z-20">Entrar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("register");
              setErr("");
            }}
            className={`relative z-10 rounded-xl py-2.5 text-xs font-bold uppercase tracking-wider transition-colors duration-300 ${
              isRegister ? "text-white" : "text-zinc-500 hover:text-white"
            }`}
          >
            {isRegister && (
              <motion.div
                layoutId="activeTabIndicator"
                className={`absolute inset-0 ${LIQUID_GLASS_MODAL_BUTTON}`}
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
              />
            )}
            <span className="relative z-20">Crear</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="block text-left group">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
              {isRegister ? "Email" : "Email o usuario"}
            </span>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
              {/* Al iniciar sesión vale el email o el nombre de usuario: un
                  `type="email"` rechazaría el usuario antes de enviarlo. */}
              <input
                type={isRegister ? "email" : "text"}
                autoComplete={isRegister ? "email" : "username"}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={form.email}
                onChange={updateField("email")}
                required
                className={`h-11 w-full pl-11 pr-3.5 ${fieldClass}`}
                placeholder={isRegister ? "tu@email.com" : "tu@email.com o usuario"}
              />
            </div>
          </div>

          {isRegister && (
            <>
              <div className="block text-left group">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
                  Usuario
                </span>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
                  <input
                    type="text"
                    autoComplete="username"
                    value={form.username}
                    onChange={updateField("username")}
                    required
                    minLength={3}
                    maxLength={30}
                    pattern="[A-Za-z0-9_-]+"
                    className={`h-11 w-full pl-11 pr-3.5 ${fieldClass}`}
                    placeholder="usuario"
                  />
                </div>
              </div>

              <div className="block text-left group">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
                  Nombre visible
                </span>
                <div className="relative">
                  <UserCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
                  <input
                    type="text"
                    autoComplete="name"
                    value={form.displayName}
                    onChange={updateField("displayName")}
                    maxLength={50}
                    className={`h-11 w-full pl-11 pr-3.5 ${fieldClass}`}
                    placeholder="Opcional"
                  />
                </div>
              </div>
            </>
          )}

          <div className="block text-left group">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-400 transition-colors group-focus-within:text-sky-300">
              Contraseña
            </span>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-500 transition-colors group-focus-within:text-sky-300 pointer-events-none" />
              <input
                type={showPassword ? "text" : "password"}
                autoComplete={isRegister ? "new-password" : "current-password"}
                value={form.password}
                onChange={updateField("password")}
                required
                minLength={isRegister ? 8 : 1}
                className={`h-11 w-full pl-11 pr-11 ${fieldClass}`}
                placeholder={isRegister ? "Mínimo 8 caracteres" : "Tu contraseña"}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-zinc-500 hover:text-white transition-colors focus:outline-none"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
              </button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {!!visibleError && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-5 flex items-start gap-2.5 rounded-2xl bg-red-500/10 px-4 py-3 text-left text-xs text-red-200 animate-in fade-in duration-200"
            >
              <AlertCircle className="mt-0.5 h-4.5 w-4.5 shrink-0 text-red-400" />
              <span className="leading-relaxed">{visibleError}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="submit"
          disabled={loading}
          className="mt-6 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-sky-500/85 bg-gradient-to-b from-sky-400/90 to-indigo-600/90 text-xs font-bold uppercase tracking-widest text-white shadow-[0_0_18px_rgba(14,165,233,0.35),inset_0_1px_1px_rgba(255,255,255,0.25)] transition hover:from-sky-400 hover:to-indigo-500 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4.5 w-4.5 animate-spin" />
          ) : isRegister ? (
            <UserPlus className="h-4.5 w-4.5" />
          ) : (
            <LogIn className="h-4.5 w-4.5" />
          )}
          <span>
            {loading
              ? isRegister
                ? "Creando cuenta..."
                : "Entrando..."
              : isRegister
                ? "Crear"
                : "Entrar"}
          </span>
        </button>
      </div>
    </motion.form>
  );
}
