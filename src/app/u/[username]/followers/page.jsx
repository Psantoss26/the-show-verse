import FollowListClient from "../FollowListClient";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `Seguidores de @${username}` };
}

export default async function FollowersPage({ params }) {
  const { username } = await params;
  return <FollowListClient username={username} relation="followers" />;
}
