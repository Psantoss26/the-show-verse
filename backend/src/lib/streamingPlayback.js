const PLATFORM_ALIASES = new Map([
  ['netflix', 'netflix'],
  ['prime', 'prime'],
  ['prime video', 'prime'],
  ['amazon', 'prime'],
  ['amazon prime video', 'prime'],
  ['max', 'max'],
  ['hbo max', 'max'],
  ['hbomax', 'max'],
  ['disney', 'disney'],
  ['disney+', 'disney'],
  ['disney plus', 'disney'],
  ['plex', 'plex'],
]);

export const STREAMING_PLATFORM_NAMES = Object.freeze({
  netflix: 'Netflix',
  prime: 'Prime Video',
  max: 'Max',
  disney: 'Disney+',
  plex: 'Plex',
});

export function normalizeStreamingPlatform(value) {
  return PLATFORM_ALIASES.get(String(value || '').trim().toLowerCase()) || null;
}

function hostnameMatches(hostname, domain) {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

function isAllowedPlaybackHost(platform, hostname) {
  switch (platform) {
    case 'netflix':
      return hostnameMatches(hostname, 'netflix.com');
    case 'prime':
      return (
        hostnameMatches(hostname, 'primevideo.com') ||
        /(^|\.)amazon\.[a-z.]+$/i.test(hostname)
      );
    case 'max':
      return (
        hostnameMatches(hostname, 'max.com') ||
        hostnameMatches(hostname, 'hbomax.com')
      );
    case 'disney':
      return hostnameMatches(hostname, 'disneyplus.com');
    case 'plex':
      return hostnameMatches(hostname, 'plex.tv');
    default:
      return false;
  }
}

export function sanitizePlaybackUrl(platformValue, value) {
  const platform = normalizeStreamingPlatform(platformValue);
  if (!platform || !value || String(value).length > 4000) return null;

  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:') return null;
    if (!isAllowedPlaybackHost(platform, url.hostname.toLowerCase())) {
      return null;
    }

    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return null;
  }
}

function buildPlaybackUrlFromContentId(platform, contentId) {
  const id = String(contentId || '').trim();
  if (!id || id.length > 200) return null;

  switch (platform) {
    case 'netflix':
      return /^\d+$/.test(id) ? `https://www.netflix.com/watch/${id}` : null;
    default:
      return null;
  }
}

export function resolveEpisodePlaybackLink({
  platform: platformValue,
  playbackUrl,
  contentId,
}) {
  const platform = normalizeStreamingPlatform(platformValue);
  if (!platform) return null;

  const url =
    sanitizePlaybackUrl(platform, playbackUrl) ||
    buildPlaybackUrlFromContentId(platform, contentId);
  if (!url) return null;

  return {
    platform,
    providerName: STREAMING_PLATFORM_NAMES[platform],
    contentId: contentId ? String(contentId).slice(0, 200) : null,
    playbackUrl: url,
  };
}
