import FollowListClient from "../FollowListClient";

export async function generateMetadata({ params }) {
  const { username } = await params;
  return { title: `@${username} sigue a` };
}

export default async function FollowingPage({ params }) {
  const { username } = await params;
  return <FollowListClient username={username} relation="following" />;
}
