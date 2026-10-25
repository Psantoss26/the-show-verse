// src/app/today/page.jsx
// «Hoy» es ahora la vista por defecto de Social: los enlaces antiguos a /today
// (con sus ?scope=&day=&group=) siguen funcionando.
import { redirect } from "next/navigation";

export default async function TodayPage({ searchParams }) {
  const params = await searchParams;
  const search = new URLSearchParams();
  for (const key of ["scope", "day", "group", "story"]) {
    const value = Array.isArray(params?.[key]) ? params[key][0] : params?.[key];
    if (value) search.set(key, value);
  }
  const query = search.toString();
  redirect(query ? `/social?${query}` : "/social");
}
