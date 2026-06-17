export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  sizes,
  unoptimized,
  fill,
  style,
  priority,
  fetchPriority,
  ...props
}) {
  if (!src) return null;

  const finalStyle = fill
    ? {
        position: "absolute",
        height: "100%",
        width: "100%",
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        objectFit: "cover",
        ...style,
      }
    : style;

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt || ""}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      style={finalStyle}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={fetchPriority}
      {...props}
    />
  );
}
