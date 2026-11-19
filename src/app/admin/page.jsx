import AdminClient from "./AdminClient";

export const metadata = {
  title: "Administración",
  description: "Estadísticas de peticiones y accesos de The Show Verse.",
  robots: { index: false, follow: false },
};

// Solo administradores (ADMIN_USER_IDS en el backend). La comprobación real
// la hace /v1/admin: esta página solo pinta lo que el backend deje ver.
export default function AdminPage() {
  return <AdminClient />;
}
