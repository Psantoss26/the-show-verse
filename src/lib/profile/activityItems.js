// El feed combina fuentes y se pagina por offset. Entre dos peticiones puede
// entrar un evento nuevo, por lo que dos ventanas consecutivas pueden solaparse.
// La identidad pública `type:uuid` es estable y permite conservar solo el primer
// evento sin alterar el orden cronológico que devuelve el backend.
export function dedupeActivityItems(items) {
  const seenIds = new Set();

  return (Array.isArray(items) ? items : []).filter((item) => {
    const id = typeof item?.id === "string" ? item.id.trim() : "";
    if (!id) return true;
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    return true;
  });
}
