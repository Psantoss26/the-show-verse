// backend/src/lib/admin.js
// Administradores: los ids de usuario de ADMIN_USER_IDS (separados por comas).
// Solo ellos leen las estadísticas de /v1/admin.

export function adminUserIds(env = process.env) {
  return new Set(
    String(env.ADMIN_USER_IDS || '')
      .split(',')
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAdminUser(user, env = process.env) {
  const id = String(user?.id || '').toLowerCase();
  return Boolean(id) && adminUserIds(env).has(id);
}
