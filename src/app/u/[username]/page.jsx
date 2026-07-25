import ProfileClient from "./ProfileClient";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: `Perfil de @${username} en The Show Verse.`,
  };
}

export default async function UserProfilePage({ params }) {
  const { username } = await params;
  return <ProfileClient username={username} />;
}
