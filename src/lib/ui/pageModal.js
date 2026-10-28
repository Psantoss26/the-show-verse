// ¿El elemento pulsado está dentro de un modal de la página (p. ej. los
// episodios agrupados del Historial)? La vista previa abierta desde ahí se
// superpone a ese modal (`overModal`: z-[10001] frente al z-[10000] de los
// modales) en vez de quedar debajo, y al cerrarla el modal sigue abierto.
// Solo vale al abrir desde cerrado: en ese momento no hay ficha en pantalla,
// así que cualquier diálogo es ajeno.
export function isInsidePageModal(node) {
  return Boolean(node?.closest?.('[aria-modal="true"]'));
}
