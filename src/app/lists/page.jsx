// /src/app/lists/page.jsx
import { cookies } from "next/headers";
import ListsClient from "./ListsClient";
import {
  LISTS_SOURCE_COOKIE,
  readListsSource,
} from "@/lib/lists/listsSourcePrefs";

// La pestaña guardada llega en cookie para que el HTML del servidor ya traiga
// su título y su contenido (ver listsSourcePrefs.js).
export default async function ListsPage() {
  const cookieStore = await cookies();
  const initialSource = readListsSource(
    cookieStore.get(LISTS_SOURCE_COOKIE)?.value,
  );
  return <ListsClient initialSource={initialSource} />;
}
