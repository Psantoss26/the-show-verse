export async function generateMetadata({ params }) {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: `Perfil de @${username} en The Show Verse.`,
  };
}

export default function UserProfilePage() {
  // El contenido visible lo mantiene el layout persistente de usuario.
  return null;
}
