// Tarjetas de información de la cabecera de /lists (como las de Historial,
// Favoritos o En progreso), TRES por pestaña, calculadas con las listas que se
// están mostrando:
//   - Mis listas:  Listas · Títulos · Públicas
//   - Comunidad:   Listas · Títulos · Me gusta
//   - Colecciones: Sagas · Películas · Media por saga
// Cada tarjeta: { key, label, value (texto ya formateado), icon, tone }.

const grouped = new Intl.NumberFormat("es-ES");
const oneDecimal = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

/** 1523 → «1523»; 12_340 → «12,3k»; 2_400_000 → «2,4M» (caben en la tarjeta). */
export function formatStatNumber(value) {
  const n = Number(value) || 0;
  if (n >= 1_000_000) return `${oneDecimal.format(n / 1_000_000)}M`;
  if (n >= 10_000) return `${oneDecimal.format(n / 1000)}k`;
  return grouped.format(n);
}

const sum = (lists, field) => lists.reduce((total, list) => total + (Number(list?.[field]) || 0), 0);

export function listsHeaderStats(source, lists) {
  const rows = Array.isArray(lists) ? lists : [];
  const count = rows.length;
  const items = sum(rows, "item_count");

  if (source === "collections") {
    return [
      { key: "count", label: "Sagas", value: formatStatNumber(count), icon: "layers", tone: "purple" },
      { key: "items", label: "Películas", value: formatStatNumber(items), icon: "film", tone: "sky" },
      {
        key: "average",
        label: "Media por saga",
        value: count ? oneDecimal.format(items / count) : "0",
        icon: "average",
        tone: "amber",
      },
    ];
  }
  if (source === "trakt") {
    return [
      { key: "count", label: "Listas", value: formatStatNumber(count), icon: "list", tone: "purple" },
      { key: "items", label: "Títulos", value: formatStatNumber(items), icon: "film", tone: "sky" },
      { key: "likes", label: "Me gusta", value: formatStatNumber(sum(rows, "likes")), icon: "heart", tone: "rose" },
    ];
  }
  return [
    { key: "count", label: "Listas", value: formatStatNumber(count), icon: "list", tone: "purple" },
    { key: "items", label: "Títulos", value: formatStatNumber(items), icon: "film", tone: "sky" },
    {
      key: "public",
      label: "Públicas",
      value: formatStatNumber(rows.filter((list) => list?.public).length),
      icon: "globe",
      tone: "emerald",
    },
  ];
}
