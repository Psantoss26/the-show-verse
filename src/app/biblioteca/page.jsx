import BibliotecaClient from "./BibliotecaClient";

export const metadata = {
  title: "Biblioteca Plex - ShowVerse",
  description:
    "Dashboard de tu biblioteca Plex con contenido y resoluciones disponibles.",
};

// Usar revalidación en lugar de force-dynamic para mejor performance
export const revalidate = 1800; // 30 minutos

export default function BibliotecaPage() {
  return <BibliotecaClient />;
}
