import BibliotecaClient from "./BibliotecaClient";

export const metadata = {
  title: "Biblioteca Plex - ShowVerse",
  description:
    "Dashboard de tu biblioteca Plex con contenido y resoluciones disponibles.",
};

export const dynamic = "force-dynamic";

export default function BibliotecaPage() {
  return <BibliotecaClient />;
}

