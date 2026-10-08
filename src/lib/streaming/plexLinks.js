// Plex accepts watch.plex.tv App Links. Changing their scheme to plex://
// launches the app but does not preserve a supported title destination.
// https://forums.plex.tv/t/android-universal-linking-watch-plex-tv-links/932340
export function buildPlexWatchUrl(slug, type) {
  if (typeof slug !== "string" || !slug.trim()) return null;
  return `https://watch.plex.tv/${type === "movie" ? "movie" : "show"}/${encodeURIComponent(slug.trim())}`;
}

function watchUrlFromLinks(links) {
  try {
    const url = new URL(links.universal);
    if (
      url.origin === "https://watch.plex.tv" &&
      /^\/(movie|show)\/[^/]+\/?$/.test(url.pathname)
    ) return `${url.origin}${url.pathname}`;
  } catch {}

  // Older DetailsClient snapshots contain the slug under this legacy field.
  const match = /^plex:\/\/(movie|show)\/([^/?#]+)$/.exec(links.slug || "");
  if (match) return `https://watch.plex.tv/${match[1]}/${match[2]}`;
  return null;
}

export function getPlexLink(links) {
  if (!links) return "#";
  if (typeof links === "string") return links;
  const web = links.web || "";
  const watch = watchUrlFromLinks(links);
  const desktop = typeof window === "undefined" ||
    (typeof window.matchMedia === "function" && window.matchMedia(
      "(min-width: 64rem) and (hover: hover) and (pointer: fine)",
    ).matches);

  if (desktop) return web || watch || "#";
  // Unmatched personal media may have no public Plex title. Keep its exact
  // server details URL rather than sending an unsupported command to the app.
  if (!watch) return web || "#";

  const android = typeof navigator !== "undefined" &&
    /Android/i.test(navigator.userAgent || "");
  const nativeWrapper = typeof window.TSVAndroidBridge?.isApp === "function";
  if (android && !nativeWrapper) {
    return `intent://${watch.slice("https://".length)}#Intent;scheme=https;package=com.plexapp.android;S.browser_fallback_url=${encodeURIComponent(watch)};end`;
  }
  return watch;
}
