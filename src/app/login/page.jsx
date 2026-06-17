import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Conectando TMDb",
};

function sanitizeNextPath(nextPath) {
  if (!nextPath || typeof nextPath !== "string") return "/";
  if (!nextPath.startsWith("/")) return "/";
  if (nextPath.startsWith("/login")) return "/";
  if (nextPath.startsWith("/auth/callback")) return "/";
  if (nextPath.startsWith("/auth/tmdb/callback")) return "/";
  if (nextPath.startsWith("/api/tmdb/auth/")) return "/";
  return nextPath;
}

export default async function LoginPage({ searchParams }) {
  const sp = await Promise.resolve(searchParams);
  const rawNext = typeof sp?.next === "string" ? sp.next : "/";
  const next = sanitizeNextPath(rawNext);

  redirect(`/api/tmdb/auth/start?next=${encodeURIComponent(next)}`);
}
