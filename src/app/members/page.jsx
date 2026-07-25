import MembersClient from "./MembersClient";

export const metadata = {
  title: "Miembros",
  description: "Busca y sigue a otros miembros de The Show Verse.",
};

export default function MembersPage() {
  return <MembersClient />;
}
