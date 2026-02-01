// Script para limpiar el caché de Plex en sessionStorage
// Ejecutar en la consola del navegador si necesitas refrescar los datos de Plex

console.log('🧹 Limpiando caché de Plex...');

let count = 0;
for (let i = 0; i < sessionStorage.length; i++) {
  const key = sessionStorage.key(i);
  if (key && key.startsWith('plex:')) {
    sessionStorage.removeItem(key);
    count++;
    i--; // Ajustar el índice después de eliminar
  }
}

console.log(`✅ Se eliminaron ${count} entradas de caché de Plex`);
console.log('🔄 Recarga la página para obtener las nuevas URLs de Plex');
