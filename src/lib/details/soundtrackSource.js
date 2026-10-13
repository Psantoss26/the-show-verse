// Etiqueta y color de la fuente de una pista del soundtrack (Spotify, iTunes,
// Deezer…), en la sección de la ficha y en su vista lateral.
export function getSoundtrackSourceBadge(source) {
  const key = String(source || "Spotify").toLowerCase();
  if (key === "itunes") {
    return {
      label: "iTunes",
      textClass: "text-fuchsia-300",
      dotClass: "bg-fuchsia-400 shadow-[0_0_6px_rgba(232,121,249,0.8)]",
    };
  }
  if (key === "deezer") {
    return {
      label: "Deezer",
      textClass: "text-orange-300",
      dotClass: "bg-orange-400 shadow-[0_0_6px_rgba(251,146,60,0.8)]",
    };
  }
  return {
    label: "Spotify",
    textClass: "text-emerald-400",
    dotClass: "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]",
  };
}
