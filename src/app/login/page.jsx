import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Iniciar sesión",
};

function sanitizeNextPath(nextPath) {
  if (!nextPath || typeof nextPath !== "string") return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("/login")) return "/";
  if (nextPath.startsWith("/auth/callback")) return "/";
  if (nextPath.startsWith("/auth/tmdb/callback")) return "/";
  if (nextPath.startsWith("/api/")) return "/";
  return nextPath;
}

export default async function LoginPage({ searchParams }) {
  const sp = await Promise.resolve(searchParams);
  const rawNext = typeof sp?.next === "string" ? sp.next : "/";
  // El client ID web de Google es público (va en el botón oficial): se lee en
  // el servidor para no duplicarlo en una variable NEXT_PUBLIC_.
  return (
    <LoginClient
      next={sanitizeNextPath(rawNext)}
      googleClientId={process.env.GOOGLE_CLIENT_ID || ""}
    />
  );
}
