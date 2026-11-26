import { preload } from "react-dom";
import { ratingScoreSourcesFor, ratingScoresUrl } from "@/lib/details/ratingScoresUrl";

/**
 * Adelanta las notas del público (Rotten Tomatoes, Metacritic, Letterboxd) al
 * PARSEO DEL HTML, como MobilePosterPreload con la portada.
 *
 * Sin esto, la petición no sale hasta que el bundle se descarga y React hidrata
 * DetailsClient (en un móvil, segundos). Con el `<link rel="preload">` el
 * navegador la lanza mientras lee el documento y, cuando useRatingScores hace
 * su `fetch` a la MISMA URL, recibe esa respuesta en vez de pedirla otra vez.
 * `crossOrigin="anonymous"` hace que el modo y las credenciales coincidan con
 * los de un `fetch()` por defecto: si no, la precarga no se reutiliza.
 * `preload()` de react-dom (y no un `<link>` en JSX) para que React lo ponga en
 * el `<head>` UNA vez aunque la ficha se pinte en varias capas.
 */
export default function RatingScoresPreload({ type, id }) {
  if (!/^[1-9]\d{0,9}$/.test(String(id ?? ""))) return null;
  for (const source of ratingScoreSourcesFor(type)) {
    preload(ratingScoresUrl(type, id, source), { as: "fetch", crossOrigin: "anonymous" });
  }
  return null;
}
