import { buildImg } from "@/lib/dashboard/media";
import { getPlexLink } from "./plexLinks.js";

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
