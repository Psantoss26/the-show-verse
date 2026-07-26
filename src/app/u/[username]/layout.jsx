import DetailModalProvider from "@/components/dashboard/DetailModalProvider";
import ProfileRouteShell from "./ProfileRouteShell";

export default async function UserProfileLayout({ children, params }) {
  const { username } = await params;

  return (
    <DetailModalProvider placement="right">
      <ProfileRouteShell username={username}>{children}</ProfileRouteShell>
    </DetailModalProvider>
  );
}
