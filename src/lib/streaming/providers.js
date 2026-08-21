import { buildImg } from "@/lib/dashboard/media";
import { isAndroidApp } from "@/lib/android/appBridge";

function normalizeProviderName(name = "") {
  return String(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getProviderFamilyKey(provider) {
  const normalizedName = normalizeProviderName(
    provider?.provider_name || provider?.name || "",
  );

  if (provider?.isPlex) return "plex";

  if (
    provider?.provider_id === 149 ||
    provider?.provider_id === 2241 ||
    /\bmovistar\b|^m\+/.test(normalizedName)
  ) {
    return "movistar";
  }

  return provider?.provider_id != null
    ? String(provider.provider_id)
    : normalizedName.replace(/[^a-z0-9]+/g, "-");
}

function providerPreferenceScore(provider, familyKey) {
  if (familyKey !== "movistar") return 0;

  const name = normalizeProviderName(provider?.provider_name || provider?.name || "");
  let score = name.length;

  if (
    /\bficcion\b|\btotal\b|\bdeportes\b|\blaliga\b|\bseleccion\b/.test(name)
  ) {
    score += 100;
  }

  return score;
}

function canonicalizeStreamingProvider(provider) {
  if (!provider) return provider;

  if (getProviderFamilyKey(provider) === "movistar") {
    return {
      ...provider,
      provider_id: 2241,
      provider_name: "Movistar +",
      name: "Movistar +",
      logo_path: "/jse4MOi92Jgetym7nbXFZZBI6LK.jpg",
    };
  }

  return provider;
}

export function dedupeStreamingProviders(providers) {
  const deduped = [];
  const indexByFamily = new Map();

  for (const rawProvider of Array.isArray(providers) ? providers : []) {
    if (!rawProvider) continue;

    const provider = canonicalizeStreamingProvider(rawProvider);
    const familyKey = getProviderFamilyKey(provider);
    const existingIndex = indexByFamily.get(familyKey);

    if (existingIndex == null) {
      indexByFamily.set(familyKey, deduped.length);
      deduped.push(provider);
      continue;
    }

    const existing = deduped[existingIndex];
    if (
      providerPreferenceScore(provider, familyKey) <
      providerPreferenceScore(existing, familyKey)
    ) {
      deduped[existingIndex] = provider;
    }
  }

  return deduped;
}

function getProviderLogoSrc(provider) {
  const logoPath = provider?.logo_path || provider?.logo || "";
  if (!logoPath) return "";
  if (logoPath.startsWith("http")) return logoPath;
  if (logoPath.startsWith("/logo-")) return logoPath;
  if (logoPath.startsWith("/")) {
    return buildImg(logoPath, "original");
  }
  return logoPath;
}

// ¿Estamos en "un ordenador de verdad"? Se usa el MISMO criterio que la
// variante `desktop:` de la web (ver globals.css): el ancho no distingue un
// iPad de un monitor, el puntero sí. En SSR se asume escritorio porque el
// destino web vale en cualquier parte; da igual, porque la tarjeta de Plex solo
// existe tras la consulta a /api/plex, que ocurre ya en el cliente.
function esEscritorio() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia(
    "(min-width: 64rem) and (hover: hover) and (pointer: fine)",
  ).matches;
}

// Enlace del icono de Plex (servidor personal). Va DIRECTO al título: antes
// pasaba por una página intermedia (/api/plex/open) que anunciaba "Abriendo en
// Plex…" y lanzaba el deep link por JS; ahora el href ya es el destino final.
//
// Además es más fiable: un click en un <a> es un gesto del usuario, y los
// navegadores dejan pasar los esquemas propios (`plex://`) mucho mejor así que
// desde un `location.href` automático.
//
// POLÍTICA EN MÓVIL Y TABLET: la app primero. Solo se cae a la web si este
// contenido no tiene deep link nativo (sin slug no hay `plex://`).
function getPlexLink(plexUrl) {
  if (!plexUrl) return "#";
  if (typeof plexUrl === "string") return plexUrl;

  const web = plexUrl.web || "";
  const universal = plexUrl.universal || "";   // https://watch.plex.tv/{type}/{slug}
  const slug = plexUrl.slug || "";             // plex://{type}/{slug}
  const androidIntent = plexUrl.androidSlugIntent || ""; // intent:// para Chrome

  // Escritorio: Plex Web sobre el servidor personal es el destino natural.
  if (esEscritorio()) return web || universal || "#";

  // Dentro de la app de Android, el WebView resuelve los esquemas externos con
  // `ACTION_VIEW`, que entiende `plex://` pero NO `intent://` (esa forma
  // necesita `Intent.parseUri`). Así que allí se usa `plex://`.
  const enChromeAndroid =
    typeof navigator !== "undefined" &&
    /Android/i.test(navigator.userAgent || "") &&
    !isAndroidApp();

  if (enChromeAndroid && androidIntent) return androidIntent;

  return slug || universal || web || "#";
}

function getPlatformLink(provider, { justwatchUrl }) {
  if (provider?.isPlex === true) {
    return getPlexLink(provider.url);
  }

  return provider?.url || justwatchUrl || "#";
}

export function createPlatformItem(provider, options) {
  const href = getPlatformLink(provider, options);
  const isPlexProvider = provider?.isPlex === true;
  const hasValidLink = Boolean(href && href !== "#");

  return {
    key: provider?.provider_id ?? provider?.provider_name ?? provider?.name,
    title: provider?.provider_name || provider?.name || "Plataforma",
    subtitle: isPlexProvider ? "Disponible en tu servidor local" : null,
    icon: getProviderLogoSrc(provider),
    href,
    target: isPlexProvider ? "_self" : hasValidLink ? "_blank" : undefined,
    rel: hasValidLink && !isPlexProvider ? "noreferrer" : undefined,
    isPlexProvider,
    hasValidLink,
  };
}
