// src/app/social/page.jsx
import SocialClient from "./SocialClient";
import DetailModalProvider from "@/components/dashboard/DetailModalProvider";

export const metadata = {
  title: "Social",
  description: "La actividad de la gente a la que sigues, y la tuya",
};

export default function SocialPage() {
  return (
    <DetailModalProvider placement="right">
      <SocialClient />
    </DetailModalProvider>
  );
}
