import ProfileClient from "./ProfileClient";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return {
    title: `@${username}`,
    description: `Perfil de @${username} en The Show Verse.`,
  };
}

export default async function UserProfilePage({ params }) {
  const { username } = await params;
  return (
    <DetailModalProvider placement="right">
      <ProfileClient username={username} />
    </DetailModalProvider>
  );
}
