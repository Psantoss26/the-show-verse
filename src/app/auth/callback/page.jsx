import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Conectando cuenta",
};

export default async function CallbackPage({ searchParams }) {
  const sp = await Promise.resolve(searchParams);
  const usp = new URLSearchParams();

  for (const [key, value] of Object.entries(sp || {})) {
    if (Array.isArray(value)) {
      value.forEach((entry) => usp.append(key, entry));
    } else if (value != null) {
      usp.set(key, value);
    }
  }

  const qs = usp.toString();
  redirect(`/api/tmdb/auth/callback${qs ? `?${qs}` : ""}`);
}
