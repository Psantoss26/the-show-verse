import { pickMobileHeroPosterPath } from "@/lib/details/tmdbImages";

// Ancho con el que DetailsClient pide la portada móvil visible (`posterLowUrl`).
// Tiene que coincidir EXACTAMENTE: una precarga con otro ancho es otra URL, así
// que no la aprovecharía nadie y sería una descarga de más.
const MOBILE_POSTER_WIDTH = "w500";

/**
 * Adelanta la descarga de la portada móvil al PARSEO DEL HTML.
 *
 * Sin esto, la portada no puede empezar a bajarse hasta que el bundle se
 * descarga, se ejecuta y React hidrata la ficha -- que en DetailsClient no es
 * poco. El navegador, en cambio, ve este `<link>` mientras aún está leyendo el
 * documento y arranca la petición ahí mismo, en paralelo con el JavaScript.
 *
 * `media` limita la precarga al viewport móvil, que es el único donde se usa
 * esta portada: en escritorio y tablet el navegador ni la pide, así que no
 * gasta datos de nadie. Es también lo que hace innecesario adivinar el
 * dispositivo en el servidor.
 *
 * Se precarga la versión BAJA a propósito: es la que se pinta primero y la que
 * gobierna el montaje de la de alta calidad, así que adelantarla adelanta toda
 * la cadena.
 *
 * NOTA sobre portadas personalizadas: esto apunta siempre a la elección
 * automática. Desde una red externa es exactamente lo que se va a pintar
 * (ahí los overrides están apagados). Desde la red del servidor, un título con
 * portada personalizada descargará esta de más -- en esa red la penalización es
 * despreciable, y evita tener que leer cabeceras aquí, lo que volvería dinámica
 * una página que hoy se cachea 10 minutos.
 */
export default function MobilePosterPreload({ data }) {
  const path = pickMobileHeroPosterPath({
    posterPath: data?.poster_path,
    profilePath: data?.profile_path,
    posters: data?.images?.posters,
  });

  if (!path) return null;

  return (
    <link
      rel="preload"
      as="image"
      href={`https://image.tmdb.org/t/p/${MOBILE_POSTER_WIDTH}${path}`}
      media="(max-width: 640px)"
      fetchPriority="high"
    />
  );
}
