import Image from "next/image";

const DEFAULT_WIDTH = 768;
const DEFAULT_HEIGHT = 1152;
const OPTIMIZED_REMOTE_HOSTS = new Set(["image.tmdb.org"]);

function isBypassedAsset(src) {
  if (typeof src !== "string") return false;
  return (
    src.startsWith("data:") ||
    src.startsWith("blob:") ||
    /\.(?:svg|gif)(?:[?#].*)?$/i.test(src) ||
    /^\/(?:apple-icon|favicon|icon|logo-)/i.test(src)
  );
}

function canUseNextImage(src) {
  if (!src) return false;
  if (typeof src !== "string") return true;
  if (isBypassedAsset(src)) return false;
  if (src.startsWith("/")) return true;

  try {
    const url = new URL(src);
    return OPTIMIZED_REMOTE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  sizes,
  unoptimized,
  ...props
}) {
  if (!src) return null;

  if (!canUseNextImage(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt || ""} {...props} />;
  }

  const imageProps = {
    src,
    sizes: sizes || "(max-width: 768px) 100vw, 33vw",
    unoptimized,
    ...props,
  };

  if (props.fill) {
    return <Image {...imageProps} alt={alt || ""} />;
  }

  return (
    <Image
      {...imageProps}
      alt={alt || ""}
      width={Number(width) || DEFAULT_WIDTH}
      height={Number(height) || DEFAULT_HEIGHT}
    />
  );
}
