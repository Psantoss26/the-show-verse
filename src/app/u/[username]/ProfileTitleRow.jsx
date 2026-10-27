"use client";

// Fila del NOMBRE de la cabecera del perfil con sus botones de acción:
// Configuración, Compartir, Sincronizar y Cerrar sesión en el propio; Compartir
// y Seguir en el de otro.
//
// EN MÓVIL, si los botones no dejan sitio al nombre (se recortaría con «…»),
// se recogen en un botón de tres puntos que despliega el resto como un menú.
// En el perfil propio, Cerrar sesión se queda a la vista junto a los tres
// puntos si así cabe el nombre; si tampoco, va también al menú. Se mide con el
// nombre ENTERO frente al hueco que le dejaría cada nivel (su ancho se guarda
// mientras se ve), así que al recoger no se vuelve a desplegar solo porque
// ahora el nombre sí cabe.
//
// La hoja de compartir, el aviso de cerrar sesión y el estado de Seguir viven
// aquí, fuera de los botones: siguen abiertos (y al día) aunque los botones se
// recojan o se desplieguen por debajo.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LogOut, MoreHorizontal, RotateCcw, Settings, Share2 } from "lucide-react";

import LogoutConfirmModal from "@/components/auth/LogoutConfirmModal";
import { useShareAction } from "@/components/details/DetailHeaderBits";
import LiquidButton from "@/components/LiquidButton";
import FollowButton from "@/components/social/FollowButton";
import { useRouter } from "@/lib/offline/useOfflineRouter";
import { buildProfileShareCard } from "@/lib/profile/shareProfile";
import { LIQUID_GLASS_PANEL } from "@/lib/ui/liquidGlass";

const HEADER_BUTTON_CLASS =
  "!h-11 !w-11 @[640px]/detail-page:!h-12 @[640px]/detail-page:!w-12 !border-0 !bg-white/5 !bg-gradient-to-br !from-white/20 !via-white/5 !to-transparent shadow-lg backdrop-blur-md hover:!bg-white/15";
const HEADER_ICON_CLASS = "h-[1.375rem] w-[1.375rem] @[640px]/detail-page:h-5 @[640px]/detail-page:w-5";
// Mismo corte que el gesto de cambiar de sección del perfil (ProfileClient).
const MOBILE_QUERY = "(max-width: 639px)";
const MENU_GAP = 8;

// Compartir el PERFIL: la hoja de compartir de fichas y listas con la imagen
// del perfil —foto, nombre, nivel, cifras y favoritos, ver
// lib/profile/shareProfile— y el enlace a /u/<usuario> (aunque se esté en una
// sección como /u/<usuario>/stats).
function useProfileShare(profile) {
  const { user } = profile;
  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/u/${encodeURIComponent(user.username)}`
      : undefined;
  const card = useMemo(() => buildProfileShareCard(profile), [profile]);
  return useShareAction({
    title: `${user.displayName} (@${user.username})`,
    text: `Mira el perfil de ${user.displayName} en The Show Verse`,
    url,
    card,
    kind: "profile",
  });
}

// Cuánto se recogen los botones: todos a la vista, Cerrar sesión + tres
// puntos (solo en el perfil propio) o solo los tres puntos.
const ACTIONS_EXPANDED = 0;
const ACTIONS_LOGOUT = 1;
const ACTIONS_MENU = 2;
// En el perfil ajeno no hay Cerrar sesión: de todos a la vista, al menú.
const SELF_LEVELS = [ACTIONS_EXPANDED, ACTIONS_LOGOUT, ACTIONS_MENU];
const OTHER_LEVELS = [ACTIONS_EXPANDED, ACTIONS_MENU];

/**
 * ¿Cuánto hay que recoger los botones? Solo en móvil: se recoge un nivel cada
 * vez que el nombre no cabe entero, y se despliega uno cuando, con los botones
 * de ese nivel, cabría. El ancho de cada nivel se guarda mientras se ve; el del
 * intermedio, si aún no se ha visto, son dos botones redondos y su hueco.
 * `actionsRef` es el contenedor de los botones que haya en cada momento.
 */
function useCollapsedActions({ rowRef, nameRef, actionsRef, levels, watch }) {
  const [level, setLevel] = useState(ACTIONS_EXPANDED);
  const widths = useRef({});

  useLayoutEffect(() => {
    const row = rowRef.current;
    const name = nameRef.current;
    const actions = actionsRef.current;
    if (!row || !name || !actions) return undefined;
    const mobile = window.matchMedia(MOBILE_QUERY);
    // Ancho del nombre ENTERO, con decimales: `scrollWidth` redondea y un
    // nombre que se pasa 1,7 px (ya con «…») no se detectaba.
    const range = document.createRange();
    const nameWidth = () => {
      range.selectNodeContents(name);
      return range.getBoundingClientRect().width;
    };
    const index = levels.indexOf(level);

    const widthOf = (target) => {
      if (widths.current[target]) return widths.current[target];
      if (target !== ACTIONS_LOGOUT) return 0;
      const button = actions.querySelector("button");
      const gap = Number.parseFloat(getComputedStyle(actions).columnGap) || 0;
      return button ? button.getBoundingClientRect().width * 2 + gap : 0;
    };

    // Una medida que llega tarde (la tipografía) con el nivel anterior leería
    // los botones del nuevo y guardaría un ancho falso: entonces se desplegaba
    // y recogía sin fin.
    let active = true;
    const check = () => {
      if (!active) return;
      if (!mobile.matches) {
        setLevel(ACTIONS_EXPANDED);
        return;
      }
      // Oculta (pantalla guardada al navegar): nada que medir.
      if (!row.getBoundingClientRect().width) return;
      widths.current[level] = actions.getBoundingClientRect().width;
      if (nameWidth() > name.getBoundingClientRect().width + 0.5) {
        if (index < levels.length - 1) setLevel(levels[index + 1]);
        return;
      }
      if (index <= 0) return;
      const target = levels[index - 1];
      const needed = widthOf(target);
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const room = row.getBoundingClientRect().width - needed - gap;
      if (needed && nameWidth() <= room - 0.5) setLevel(target);
    };

    check();
    const observer = new ResizeObserver(check);
    observer.observe(row);
    observer.observe(name);
    observer.observe(actions);
    mobile.addEventListener("change", check);
    // La tipografía puede llegar después del primer pintado y cambia el ancho.
    document.fonts?.ready.then(check).catch(() => {});
    return () => {
      active = false;
      observer.disconnect();
      mobile.removeEventListener("change", check);
    };
    // `watch`: lo que cambia el ancho del nombre o de los botones.
  }, [rowRef, nameRef, actionsRef, level, levels, watch]);

  return levels.includes(level) ? level : ACTIONS_EXPANDED;
}

function MenuItem({ icon: Icon, tone, label, onClick, disabled = false }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
    >
      <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
}

// Botón de tres puntos y su menú. El menú va en un portal a <body>, como los
// desplegables del navbar: dentro de la cabecera (que se anima) el cristal se
// quedaría sin nada que difuminar.
function ActionsMenu({ children, open, onOpenChange, buttonProps }) {
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => setPortalReady(true), []);

  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({
      top: Math.round(rect.bottom + MENU_GAP),
      right: Math.max(8, Math.round(window.innerWidth - rect.right)),
      minWidth: 220,
    });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const close = () => onOpenChange(false);
    const onPointerDown = (event) => {
      if (panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target)) return;
      close();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      close();
      buttonRef.current?.querySelector("button")?.focus?.({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
    };
  }, [open, onOpenChange]);

  return (
    <>
      <span ref={buttonRef} className="flex shrink-0">
        <LiquidButton
          onClick={() => onOpenChange(!open)}
          activeColor="blue"
          groupId="profile-header-actions"
          title="Más acciones"
          aria-label="Más acciones"
          aria-haspopup="menu"
          aria-expanded={open}
          active={open}
          className={HEADER_BUTTON_CLASS}
          {...buttonProps}
        >
          <MoreHorizontal className={HEADER_ICON_CLASS} />
        </LiquidButton>
      </span>
      {portalReady &&
        createPortal(
          <AnimatePresence>
            {open && position ? (
              <motion.div
                ref={panelRef}
                role="menu"
                aria-label="Acciones de perfil"
                style={position}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                className={`fixed z-[99999] origin-top-right overflow-hidden rounded-2xl p-2 text-white ${LIQUID_GLASS_PANEL}`}
              >
                {children}
              </motion.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

export default function ProfileTitleRow({ profile, isSelf, syncing, onSync }) {
  const { user } = profile;
  const rowRef = useRef(null);
  const nameRef = useRef(null);
  const actionsRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  // Seguir se monta y desmonta al recoger los botones: el estado vive aquí.
  const [following, setFollowing] = useState(Boolean(profile.isFollowing));
  useEffect(() => setFollowing(Boolean(profile.isFollowing)), [profile.isFollowing]);

  const share = useProfileShare(profile);
  const levels = isSelf ? SELF_LEVELS : OTHER_LEVELS;
  const level = useCollapsedActions({
    rowRef,
    nameRef,
    actionsRef,
    levels,
    watch: `${user.displayName}|${isSelf}|${following}`,
  });
  useEffect(() => {
    if (level === ACTIONS_EXPANDED) setMenuOpen(false);
  }, [level]);

  // Cada acción del menú lo cierra antes de hacer lo suyo.
  const fromMenu = (action) => () => {
    setMenuOpen(false);
    action();
  };
  const router = useRouter();
  // Navegación del cliente, no recarga: una carga completa enseña la barra de
  // progreso del navegador mientras llega la página.
  const openSettings = () => router.push("/profile/settings");

  const logoutButton = (
    <LiquidButton
      onClick={() => setShowLogoutModal(true)}
      disabled={syncing}
      activeColor="red"
      groupId="profile-header-actions"
      title="Cerrar sesión"
      aria-label="Cerrar sesión"
      className={`${HEADER_BUTTON_CLASS} !text-red-400 hover:!text-red-300`}
    >
      <LogOut className={HEADER_ICON_CLASS} />
    </LiquidButton>
  );

  return (
    <div
      ref={rowRef}
      className="flex min-w-0 items-center justify-between gap-2 @[1024px]/detail-page:justify-start @[1024px]/detail-page:gap-4"
    >
      <h1
        ref={nameRef}
        className="min-w-0 flex-1 truncate text-[clamp(1.35rem,6vw,2rem)] font-black leading-[0.95] tracking-[-0.06em] text-white @[1024px]/detail-page:flex-none @[640px]/detail-page:text-[clamp(2.25rem,4.1vw,3.5rem)]"
      >
        {user.displayName}<span className="text-emerald-400">.</span>
      </h1>

      {/* Margen vertical negativo: los botones (44-48 px) son más altos que
          el nombre y, sin él, alargan la fila y separan el @usuario de debajo. */}
      <div
        ref={actionsRef}
        className="-my-2 flex shrink-0 items-center gap-1 @[640px]/detail-page:gap-2"
        aria-label="Acciones de perfil"
      >
        {level !== ACTIONS_EXPANDED ? (
          <>
            {/* Cerrar sesión se queda a la vista mientras quepa (nivel
                intermedio); el resto va al menú. */}
            {level === ACTIONS_LOGOUT ? logoutButton : null}
            <ActionsMenu open={menuOpen} onOpenChange={setMenuOpen} buttonProps={share.warmProps}>
              {isSelf ? (
                <>
                  <MenuItem icon={Settings} tone="text-teal-300" label="Configuración" onClick={fromMenu(openSettings)} disabled={syncing} />
                  <MenuItem icon={Share2} tone="text-sky-300" label="Compartir perfil" onClick={fromMenu(share.handleShare)} disabled={syncing} />
                  <MenuItem icon={RotateCcw} tone="text-emerald-300" label="Sincronizar" onClick={fromMenu(onSync)} disabled={syncing} />
                  {level === ACTIONS_MENU ? (
                    <>
                      <div className="my-1.5 h-px bg-white/5" />
                      <MenuItem icon={LogOut} tone="text-red-400" label="Cerrar sesión" onClick={fromMenu(() => setShowLogoutModal(true))} disabled={syncing} />
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <MenuItem icon={Share2} tone="text-sky-300" label="Compartir perfil" onClick={fromMenu(share.handleShare)} />
                  <div className="my-1.5 h-px bg-white/5" />
                  <div className="px-1 pb-1 pt-0.5">
                    <FollowButton
                      username={user.username}
                      initialFollowing={following}
                      onChange={setFollowing}
                      className="w-full"
                    />
                  </div>
                </>
              )}
            </ActionsMenu>
          </>
        ) : isSelf ? (
          <>
            <LiquidButton
              onClick={openSettings}
              disabled={syncing}
              activeColor="teal"
              groupId="profile-header-actions"
              title="Configuración"
              className={HEADER_BUTTON_CLASS}
            >
              <Settings className={HEADER_ICON_CLASS} />
            </LiquidButton>
            <LiquidButton
              onClick={share.handleShare}
              {...share.warmProps}
              disabled={syncing}
              activeColor="blue"
              groupId="profile-header-actions"
              title="Compartir perfil"
              aria-label="Compartir perfil"
              aria-haspopup="dialog"
              className={HEADER_BUTTON_CLASS}
            >
              <Share2 className={HEADER_ICON_CLASS} />
            </LiquidButton>
            <LiquidButton
              onClick={onSync}
              disabled={syncing}
              loading={syncing}
              activeColor="green"
              groupId="profile-header-actions"
              title="Sincronizar"
              className={HEADER_BUTTON_CLASS}
            >
              <RotateCcw className={`${HEADER_ICON_CLASS} ${syncing ? "animate-spin" : ""}`} />
            </LiquidButton>
            {logoutButton}
          </>
        ) : (
          <>
            <LiquidButton
              onClick={share.handleShare}
              {...share.warmProps}
              activeColor="blue"
              groupId="profile-header-actions"
              title="Compartir perfil"
              aria-label="Compartir perfil"
              aria-haspopup="dialog"
              className={HEADER_BUTTON_CLASS}
            >
              <Share2 className={HEADER_ICON_CLASS} />
            </LiquidButton>
            <FollowButton username={user.username} initialFollowing={following} onChange={setFollowing} />
          </>
        )}
      </div>

      {share.sheet}
      {isSelf ? (
        <LogoutConfirmModal open={showLogoutModal} onClose={() => setShowLogoutModal(false)} />
      ) : null}
    </div>
  );
}
