# Changelog

Registro de cambios de The Show Verse, del más reciente al más antiguo.

**Cómo mantenerlo:** cada cambio que modifique lo que ve el usuario, una ruta o un endpoint añade una línea en la sección *Sin publicar* (o en el mes en curso) y actualiza el documento afectado de `docs/`. Ver la sección *Documentación* de [`AGENTS.md`](AGENTS.md).

Las entradas anteriores a julio de 2026 no están aquí: el estado de esa fecha lo describen el [`README.md`](README.md) y [`docs/`](docs/README.md).

## Sin publicar

- Sincronización de streaming: el anime que TMDb tiene en una sola temporada y Netflix parte en varias (p. ej. *Jujutsu Kaisen*, cuyo «T2·E32» es el T1·E32) se guarda con el episodio correcto. Con la extensión 3.3 se calcula con exactitud a partir de los datos de Netflix, también cuando Netflix empieza cada parte en el episodio 1. → [fiabilidad](docs/streaming-sync-reliability.md)
- Sincronización de streaming: los episodios de series con temporadas partidas o numeración absoluta (p. ej. *Ataque a los Titanes* en Netflix, donde la «Temporada 4 Parte 2» aparece como temporada 6 y el episodio 82) se guardan ahora con la temporada y el episodio de TMDb (T4·E23) en vez de un episodio que no existe. Si no se puede saber con seguridad, se guarda a nivel serie. → [fiabilidad](docs/streaming-sync-reliability.md)
- Extensión del navegador 3.3, Netflix: el título, la temporada y el episodio salen ahora del propio reproductor y de los datos de Netflix, no de leer la pantalla. Se reconoce bien aunque Netflix oculte el título mientras ves, los episodios ya no pierden la temporada y una fila del catálogo no puede colarse como título. Si esos datos no llegan, funciona como antes. Hay que actualizar la extensión. → [extensión](netflix-extension/README.md)
- Detecciones del navegador (`/detections`): nuevo resumen por plataforma de los últimos 7 días con lo que se reconoció, lo que hubo que corregir y lo que no se pudo reconocer, y una lista desplegable de lo no reconocido con su motivo (no se encontró el título, no es un título, el episodio no es de esa serie o no había texto que buscar). Lo que no se reconoce ya no se pierde: queda medido para mejorar cada plataforma. → [detecciones](docs/features/detecciones-streaming.md)
- Sincronización de streaming en el navegador: un capítulo de Netflix, Max, Disney+ o Crunchyroll que ya se reconoció una vez (o que corregiste) se reconoce siempre igual por su id en la plataforma, aunque el reproductor muestre un texto genérico o cambie su diseño; si varios usuarios coinciden, vale también para los demás. Si el reproductor indica otro episodio, se vuelve a buscar por el título. → [detecciones](docs/features/detecciones-streaming.md)
- Documentación: la comparativa con Trakt añade cómo detecta Universal Trakt Scrobbler en cada plataforma (por el id del contenido y la API del servicio, no por el texto del reproductor) y ordena los huecos para que la sincronización falle menos y funcione igual en todas las plataformas. → [comparativa](docs/features/trakt-comparativa-sync.md)
- Perfil y Social: quien tenga un plan de pago lleva una pequeña insignia «Pro» o «Sin anuncios» junto a su nombre en la cabecera del perfil y en las listas de seguidores, seguidos y miembros (en el móvil, solo el icono). El plan gratis no lleva insignia, y mientras los pagos no estén activos no aparece en nadie. → [social y perfiles](docs/features/social-y-perfiles.md)
- Planes de pago (preparados, todavía apagados): nueva página `/planes` con los planes Gratis, Sin anuncios (1,49 €/mes o 12 €/año) y Pro (3,49 €/mes o 29 €/año, con 7 días de prueba), pestaña «Suscripción» en Ajustes para ver y gestionar tu plan, y avisos «Incluido en Pro» en estadísticas, recap anual, vista neuronal, Plex, listas por encima de 3 y favoritos destacados por encima de 3. Mientras los pagos no se activen, todo sigue siendo gratis y sin anuncios. → [planes y suscripciones](docs/features/planes-y-suscripciones.md)
- Móvil, vista previa al mantener pulsado: se abre en cuanto se cumple la pulsación, ya con su portada (antes la página se difuminaba y la tarjeta tardaba hasta un segundo más en salir). Al cerrarla vuelve a la tarjeta pulsada frenando al llegar y se desvanece cerca de ella. Al tocar la portada, en ese mismo instante la vista previa se convierte en la cabecera de la ficha: la portada crece a todo el ancho y se coloca donde la pinta la ficha, y lo demás se desvanece; cuando la ficha llega, su portada está ya en ese mismo sitio y solo se ven entrar su logo, sus botones y su marcador. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Móvil, vista previa al mantener pulsado: al tocar la portada para abrir la ficha, la página de detrás se funde a oscuro en vez de dejar ver el cambio de página y la pantalla de carga, y cuando la ficha llega con su imagen la vista previa se desvanece sobre ella en lugar de desaparecer de golpe. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Ficha, modal del soundtrack: el interruptor de reproducción automática y los botones de correcto / incorrecto (y deshacer y ocultar) ya no se ven siempre; se abren con un botón de tres puntos junto a la barra de volumen, así el modal es más bajo. → [componentes](docs/frontend/components.md)
- Móvil, vista previa al mantener pulsado: la de un episodio enseña ahora la portada de su ficha (sus dos imágenes apiladas, «Episodio N · Temporada M» y su nombre) y la fila de botones de la ficha del episodio, en vez del póster de la serie. Y mantener pulsada una temporada en la sección Temporadas de la ficha de una serie abre su vista previa: su portada, la fila de botones de la temporada (tráiler, serie, vistos y puntuar) y su marcador; tocar la portada abre la temporada. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Móvil, ficha de película o serie: al hacer scroll, el marcador pasa de compacto a completo con sus estadísticas y la fila de Plataformas, Actividad, Enlaces y Compartir (y las pestañas de debajo) entra subiendo hasta su sitio de forma continua, sin pasarse y volver a bajar unos píxeles al parar el dedo. Igual en temporadas, episodios, listas y colecciones. → [componentes](docs/frontend/components.md)
- Ficha rápida (DetailModal), centrada o en panel lateral: el panel ya no tiene el canto marcado con una línea clara; se separa de la página solo por el tinte y la sombra. Igual en las vistas previa de los dashboards y el panel de temporada/episodio. → [componentes](docs/frontend/components.md)
- Social · Siguiendo y Yo: en las vistas de lista con póster y lista con backdrop, cada evento sigue mostrando la foto de perfil de quien lo hizo, junto a la imagen del título. → [social y perfiles](docs/features/social-y-perfiles.md)
- Móvil: al tocar la portada de la vista previa, esta se mantiene en pantalla hasta que se abre la ficha y entonces desaparece; ya no se cierra antes ni vuelve a asomar al volver atrás. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Móvil, vista previa al mantener pulsado: la transición al abrirla y al cerrarla ya no se ralentiza a mitad; va fluida aunque la ficha esté cargando sus datos. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Móvil, vista previa al mantener pulsado: ya no aparece primero la imagen de la tarjeta pulsada para cambiarse después por la portada; la vista previa se abre cuando su portada está cargada. El pie de la portada se funde con la tarjeta sin que se vea el corte. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Móvil, vista previa al mantener pulsado: la fila de botones y el marcador de puntuaciones y estadísticas son iguales que en la ficha móvil: mismo ancho, mismos botones (también el de reseñas, que sin sesión lleva al login), mismas letras y la misma separación entre ellos. La tarjeta sigue dejando 6 px a cada lado de la pantalla. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Móvil: mantener pulsada la tarjeta de una película, serie o episodio, en cualquier página o dashboard, abre su vista previa. La tarjeta crece hasta el centro con una transición, sin ocupar toda la pantalla y con la página difuminada detrás. Muestra solo la portada con el logo, la fila de botones y las puntuaciones. Tocar la portada abre la ficha completa y tocar fuera la cierra. Al soltar no se abre la ficha ni sale el menú del sistema. → [vista previa móvil](docs/features/vista-previa-movil.md)
- Social · Hoy, historias: en la ficha del título, el borde inferior del fondo se funde suavemente con los datos sin oscurecer la imagen, y la opinión va en dos filas (positivo arriba y negativo debajo) en lugar de en dos columnas. → [hoy](docs/features/hoy.md)
- Social · Hoy, historias: lo positivo y lo negativo de la ficha del título se ve igual que en la ficha completa, en tarjetas verde y rosa con su icono y un punto de color por frase. La ficha se ajusta a lo que mide cada título, así que siempre cabe entera sin desplazar. → [hoy](docs/features/hoy.md)
- Social · Hoy, historias: el giro entre la portada y la ficha ya no hace idas y vueltas al pasar el ratón cerca de los bordes de la tarjeta, y el fondo de la ficha se ve tal cual, sin oscurecerse ni difuminarse abajo. → [hoy](docs/features/hoy.md)
- Social: las tres tarjetas de la cabecera muestran ahora Actividades y Personas de Hoy (según lo elegido en Quién y Día) y Activos de la semana. Desaparece la línea «N actividades de M personas» bajo la barra. → [hoy](docs/features/hoy.md)
- Social · Hoy: los títulos de las tres columnas llevan una línea horizontal debajo. El panel que se abre al pulsar a una persona (Más activos, destacada, feed) es el mismo que las secciones de la ficha: pestañas Todo / Vistos / Notas / Reseñas, buscador, filas con cartel y lo que hizo, botón Seguir y enlace al perfil. En la ficha de las historias ya no se repite el título en texto, que ya va en la imagen de fondo. → [hoy](docs/features/hoy.md)
- Social · Hoy, historias: la tarjeta es más grande y ancha según el espacio de la pantalla (en un monitor 2K, unos 571 × 856 px). La ficha del título que aparece al pasar el ratón se ve entera de un vistazo, sin desplazar y a su tamaño normal (la letra y el marcador no se agrandan en tarjetas grandes; solo se reducen en pantallas bajas para que quepa). → [hoy](docs/features/hoy.md)
- Social · Hoy, historias: la portada se ve siempre entera, sin recortar y del mismo tamaño en todos los fotogramas. Quién, qué hizo y cuándo van debajo en una fila compacta de alto fijo, como en Trakt; una reseña larga se corta a dos líneas en lugar de encoger el cartel. → [hoy](docs/features/hoy.md)
- Social · Hoy, historias: el paso del cartel a la ficha del título es una tarjeta que da la vuelta. La ficha se prepara mientras se ve el cartel y solo gira cuando está completa, así que aparece entera, sin datos que lleguen después. Las flechas de anterior y siguiente están junto a la tarjeta en vez de en los bordes de la pantalla. → [hoy](docs/features/hoy.md)
- Social · Hoy, historias en el móvil: tocar la portada muestra la ficha del título (fondo, año, estado, géneros, puntuaciones, sinopsis y opinión) y pausa la historia; otro toque vuelve a la portada. Tocar fuera de la portada sigue pasando de fotograma. → [hoy](docs/features/hoy.md)
- Social · Hoy: sin bordes marcados. Fuera los contornos de las tarjetas, los carteles, la historia destacada, el botón «Reproducir historia» (ahora relleno), la raya bajo los títulos de columna, el borde del cartel de las historias al pasar el ratón y los aros oscuros entre caras, que ahora se recortan una sobre otra. El destello de la píldora «Hoy» es una luz blanca tenue en vez de un trazo rosa. → [hoy](docs/features/hoy.md)
- Social · Hoy, historias: el cartel ocupa casi todo el reproductor y, en ordenador, al pasar el ratón por encima se convierte en la ficha del título, como en Trakt. Lleva el fondo con su idioma (mismo criterio que la ficha), año, temporadas o duración, estado y géneros, el marcador compacto de la ficha móvil con las estadísticas de Trakt, la sinopsis y lo positivo y negativo de la comunidad. Mientras el ratón está encima, la historia se pausa. Un botón de cuadrícula en la cabecera de las historias lleva a la página completa de Hoy. → [hoy](docs/features/hoy.md)
- Social · Hoy: las notas se muestran de 0 a 10, tal cual se puntúan («9,5»), en la destacada, los destacados, la lista, las historias y el panel de cada persona. Antes salían convertidas a 5 estrellas («4,8»). → [hoy](docs/features/hoy.md)
- Social · Hoy: «De la gente que sigues» tiene también vista de lista (botones de vista en la barra, como en Siguiendo y Yo). Cada título va en una fila con el cartel pequeño, lo que se hizo, la hora, la nota y las caras, así que caben muchos más a lo alto; en pantallas grandes (monitores 2K) las filas son más grandes. La vista elegida se recuerda. → [hoy](docs/features/hoy.md)
- Navbar: la píldora «Hoy» es de cristal líquido, como el resto de piezas de cristal de la app. Las fotos de perfil se ven enteras y recortadas una sobre otra (sin el círculo oscuro de antes) y el contador es rosa. Social · Hoy: los títulos de las tres columnas usan la misma letra que «Películas favoritas» del perfil. → [hoy](docs/features/hoy.md)
- Social · Hoy: diseño más limpio y ordenado, al estilo de Trakt. Las tres columnas (Historia destacada, De la gente que sigues y Más activos) llevan su título alineado arriba. Lo que han visto es una rejilla de carteles con solo la foto de perfil de quien lo vio encima y una línea debajo como «Visto T1 · E2 · 22:03». La destacada es una tarjeta con el cartel centrado y «Reproducir historia». Más activos es una lista sencilla con barras finas. Texto, números e iconos a tamaños que se ven nítidos (nada por debajo de 12 px). → [hoy](docs/features/hoy.md)
- Favoritos: con el orden «Vista reciente» o «Vista antigua» los títulos aparecen ya en su orden al entrar (también al volver atrás), sin pintarse primero en otro y recolocarse con la animación. Las fechas de visionado se guardan en el navegador y, la primera vez, la lista espera al historial antes de pintarse. El resto de órdenes no cambia; Pendientes no tiene estos dos órdenes. → [caché](docs/guides/estrategia-cache.md)
- Social: la barra pasa de Siguiendo / Yo a **Hoy / Siguiendo / Yo**, con Hoy por defecto. Los filtros de Hoy (Quién: Siguiendo o Comunidad; Día; Agrupar) y el buscador van en la misma barra y, en móvil, en el mismo desplegable de filtros. Hoy enseña lo más destacado de lo que han visto, puntuado y reseñado la gente que sigues o toda la comunidad, hoy, ayer o esta semana. Incluye:
  - historias a pantalla completa por título, que avanzan solas y se recorren tocando, deslizando o con el teclado;
  - una historia destacada, que prioriza finales y estrenos;
  - una reseña y una nota destacadas;
  - «Para ti», con episodios nuevos de lo que estás viendo y estrenos de Pendientes;
  - un feed por título, por persona o por hora;
  - el ranking de los más activos.

  Las maratones cuentan como una sola acción y no aparecen fechas de importación. Los enlaces a `/today` llevan a la vista Hoy. → [hoy](docs/features/hoy.md)
- Navbar: píldora **Hoy** como la de Trakt, con las caras de quien tiene historias hoy y cuántas te quedan por ver; en móvil, un círculo con dos carteles y el contador. Un brillo recorre su borde de vez en cuando mientras queden historias sin ver, y al pulsarla se abre la primera sin ver. → [hoy](docs/features/hoy.md)
- Ajustes: nuevo interruptor «Mostrar mi actividad en Hoy · Comunidad» (activado por defecto) para quitar tu actividad de la pestaña Comunidad de Hoy. → [hoy](docs/features/hoy.md)
- Documentación: análisis de cómo sincroniza Trakt el progreso desde las plataformas de streaming frente a la sincronización propia, con los huecos pasados al roadmap. → [comparativa](docs/features/trakt-comparativa-sync.md)
- Ficha de episodio: en ordenador el fondo es una sola imagen, distinta de la que se ve en grande arriba siempre que haya otra (otra imagen del episodio o, si no, un fondo de la serie). Antes era la composición de imágenes apiladas de la portada del móvil, que sigue igual en el teléfono. → [páginas](docs/frontend/app-router-pages.md)
- Fichas de episodio y temporada: las tarjetas de Reparto, Invitados y Episodios (vista en cuadrícula) ya no marcan un borde amarillo al pasar el ratón; el efecto es el de Reparto en la ficha del título (la foto se amplía y el personaje se pone amarillo).
- Compartir (ficha, ficha rápida, temporadas, episodios, listas, colecciones y actores): la imagen aparece bastante antes. En local, de ~1,3 a ~0,8 s en la ficha y de ~2,4 a ~1,1 s en una colección; si el ratón pasa por el botón antes del clic, unos 0,25 s. La imagen pesa de 4 a 7 veces menos (JPEG de 0,3-1 MB en vez de PNG de 3-4 MB), lo que en el móvil es lo que más tardaba. El vídeo se genera en menos de la mitad de tiempo (~2,6 s en vez de ~6 s para uno de 11 s). El aspecto no cambia. → [páginas](docs/frontend/app-router-pages.md)
- Ficha de título, ficha rápida (DetailModal) y su vista teléfono: el modal de enlaces externos ya no repite IMDb, TMDb ni Trakt, que ya se abren pulsando sus puntuaciones del marcador. Quedan la web oficial, Instagram, JustWatch, Letterboxd o SeriesGraph, FilmAffinity y Wikipedia. → [componentes](docs/frontend/components.md)
- Panel lateral, vista teléfono (ficha de título, temporada y episodio): ya no se puede redimensionar. Va siempre pegado a los bordes superior e inferior de la ventana, con el ancho que le da la proporción de teléfono; antes quedaba centrado en vertical y su alto cambiaba al arrastrar el tirador. La ficha ancha del panel lateral se sigue redimensionando como hasta ahora. → [páginas de usuario](docs/features/paginas-de-usuario.md)
- Mis listas: el modal «Nueva lista» (botón «+») ya no lleva bordes marcados y pasa a ser de cristal (liquid glass), algo más contenido que el de los modales de la ficha, con reflejos y un halo morado muy sutiles: se distingue aunque el fondo sea totalmente oscuro. El fondo de la página sigue difuminado detrás. Los campos se distinguen por su relleno, con anillo morado al escribir, y «Crear» queda apagado hasta que hay nombre.
- Inicio, Películas y Series: un título abierto desde el carrusel destacado (FeaturedHero) permite pasar al anterior y al siguiente en el orden del carrusel, con las flechas de la ficha en escritorio y deslizando en móvil. Abrir un título desde otra fila del dashboard no hereda ese orden. → [páginas de usuario](docs/features/paginas-de-usuario.md)
- Ficha, vista lateral «Portadas y fondos»: la pestaña Logo enseña solo los logos en español e inglés, como la galería de la ficha (antes salían todos los idiomas: ruso, japonés, árabe…). Si un título no tiene ninguno en esos dos idiomas, se siguen enseñando todos. → [páginas](docs/frontend/app-router-pages.md)
- Fichas de temporada y episodio en móvil: deslizar a la anterior o la siguiente ya no parpadea. La copia de la ficha que se queda a la vista repetía sus animaciones de entrada (se apagaba y los botones volvían a aparecer uno a uno), tapaba la barra inferior y, al fundirse, los botones de la ficha nueva volvían a entrar; ahora la copia queda quieta, la barra sigue visible y la ficha nueva aparece ya completa. → [páginas](docs/frontend/app-router-pages.md)
- Ficha: Anterior/Siguiente ya no deja la pantalla en negro ni hace la transición a medias después de haber pasado por otra ficha. La copia de la ficha que sale se tomaba de una ficha oculta de la pila de pantallas; ahora se toma la visible, que se va con su animación mientras el fondo se queda hasta que entra la nueva. → [páginas de usuario](docs/features/paginas-de-usuario.md)
- Fichas de temporada y episodio: al ir a la anterior o la siguiente (flechas o deslizar en móvil) la pantalla ya no se apaga. La ficha actual sigue a la vista mientras carga la nueva y se funde con ella al llegar. La anterior y la siguiente se precargan en segundo plano, así que el cambio llega en ~0,3 s desde el clic. → [páginas](docs/frontend/app-router-pages.md)
- Ficha de temporada: «Ver tráiler» aparece directamente en su estado final. Antes salía activo con un spinner mientras se buscaban los vídeos y se apagaba si la temporada no tenía; ahora los vídeos llegan con la página. → [páginas](docs/frontend/app-router-pages.md)
- Servidor (Next y backend): las peticiones a TMDb ya no fallan con `fetch failed` / `ETIMEDOUT` cuando la máquina va cargada. Node daba solo 250 ms a cada una de las 12 direcciones de TMDb y, sin IPv6, las IPv4 caducaban antes de procesarse; ahora se prueba IPv4 primero con 2,5 s por intento (`src/instrumentation.js`, `backend/src/config/outbound-network.js`). → [desarrollo local](docs/infrastructure/01-local-development.md)
- Campana de alertas: al entrar o navegar se pide `/api/users/notifications` una vez, en lugar de una por cada barra (escritorio y móvil; en desarrollo eran 4 peticiones a la vez).
- Detalle de listas (comunidad, propias y colecciones): al pasar el ratón por un título se pide su nota de IMDb al instante, junto con la de las tarjetas vecinas, y aparece en la tarjeta en cuanto llega (~0,25 s; las vecinas, sin espera). Hacer scroll con el cursor encima de la parrilla no lanza peticiones. Antes solo tenían nota los 120 títulos de muestra del marcador y en las listas grandes la mayoría se quedaba sin ella. Las notas se guardan en la misma caché que Favoritos y Pendientes. → [comunidad](docs/features/comunidad.md)
- Ficha: Anterior/Siguiente (flechas en escritorio y deslizar en móvil) sigue el orden de la página desde la que se abrió. Antes mezclaba los títulos de otras páginas visitadas (un título abierto desde Favoritas podía tomar los vecinos de Historial) y en Favoritas y Pendientes se cortaba en la última tarjeta pintada.
- Listas personales: la confirmación «¿Quitar?» del modo borrar ya no se pega a los bordes ni sobresale de la tarjeta en las vistas de cuadrícula y compacta; texto y botones se apilan y se ajustan al tamaño de la tarjeta.
- Portada y fondo de las listas personales y de la comunidad: ya no salen pósters con el título impreso en títulos con galerías enormes (El Hobbit, Top Gun: Maverick…); se usa el mismo criterio sin texto que la portada móvil de la ficha.
- Listas personales: botón de papelera en la barra (modo borrar, como en Continuar viendo); la papelera de cada título solo aparece en ese modo y pide confirmación antes de quitarlo.
- Continuar viendo: cada título se puede marcar como finalizado a mano con el nuevo botón ✓ de la barra (en móvil, entre «+» y la papelera); sale de la lista y queda en el historial.
- Móvil: el menú lateral usa el mismo cristal líquido que la barra inferior (antes se veía como un panel oscuro plano).
- Menús desplegables de las páginas de usuario (favoritos, pendientes, historial, en progreso, etc.) y de la ficha de actor: sin barra de scroll, la opción elegida llega al mismo margen por la derecha que por la izquierda, sin el hueco que quedaba reservado para la barra.
- Ficha móvil: la portada sin idioma de la cabecera se elige entre las dos primeras de TMDb (la de más resolución), en lugar de la más grande de toda la galería. Igual en la vista teléfono del modal.
- Ficha de actor, panel lateral de Películas y Series: Ordenar, Desde y Hasta en una sola fila, con su icono y su flecha, ajustando tamaño y espacio al ancho del panel para que ningún texto se corte. En sus menús, la barra de scroll ya no queda pegada a las opciones.
- Móvil: con un modal abierto, los avisos emergentes salen en el borde superior (la barra queda tapada por el modal) en lugar de taparle la cabecera.
- Ficha móvil de películas a medias: la barra «Viendo» bajo la portada entra a la vez que los botones de acción y con su misma animación (la fila sube y el contenido entra con el rebote del primer botón), en lugar de aparecer antes y de golpe.
- Documentación puesta al día con las funcionalidades de julio a octubre de 2026: referencia completa de la API, mapa de páginas y nueva carpeta [`docs/features/`](docs/features/Features.md).

## Octubre de 2026

### Nuevo
- **Recap anual** «Tu año en The Show Verse» (`/recap`, `/recap/[year]`): pantallas tipo *Wrapped*, persona del año, banda sonora e imagen para compartir. → [recap-anual](docs/features/recap-anual.md)
- **Detecciones de streaming** (`/detections`) con corrección «no había ficha» / «es otro título» y reglas que aprenden de las correcciones (personales y globales con consenso). App **The Show Verse Sync** para Android. → [detecciones-streaming](docs/features/detecciones-streaming.md)
- **Letterboxd:** importación de la exportación oficial (con reseñas) y sincronización continua por RSS («me gusta» → favoritos, reseñas → ficha).
- **Importación de IMDb:** puntuaciones, vistos, watchlist y listas.
- **Exportación** de favoritos, pendientes y puntuaciones a CSV, JSON o formato Letterboxd.
- **Listas públicas en la comunidad** y «me gusta» en listas, colecciones y actores. Colecciones populares ordenadas por popularidad.
- **«Tus amigos»** en la ficha: qué han hecho con ese título las cuentas que sigues.
- **Fichas superpuestas** (rutas interceptoras `@overlay`): la página de origen queda montada y se recupera tal cual al volver.
- Navegación anterior/siguiente entre fichas con animación; vídeo compartible de un título; modo soundtrack en la ficha.
- Búsqueda en las páginas de usuario por título en inglés, español u original (`/v1/tmdb/title-names`).
- Preferencias de apertura de fichas (rápida/completa, centrada/lateral, superpuesta/acoplada, vista teléfono).
- Confirmación antes de cambiar favorito y pendiente desde la ficha.

### Mejoras
- Rediseño completo de ActorDetails (escritorio y móvil), temporadas y episodios (carruseles deslizables, modales laterales).
- Secciones «Ver todos» del dashboard con el diseño de Favoritos, botón de recargar y lista ya renderizada en servidor.
- Vistas previas del dashboard: tráiler en un solo intento, sin solapes.
- Criterio mejorado de recomendaciones y de «Más esperadas».
- Copia de seguridad de Redis en el NAS.

## Septiembre de 2026

### Nuevo
- **Notificaciones push** (Web Push y FCM) y avisos dentro de la app para cada acción. → [push-notifications](docs/push-notifications.md)
- **Vista neuronal** del perfil (grafo de títulos, géneros y sagas).
- **Modo sin conexión** de la PWA: copia local de las páginas personales y fichas visitadas. → [lib-offline](docs/frontend/lib/lib-offline.md)
- Ficha en **panel lateral** (modos superpuesto y acoplado) y «vista teléfono» incrustada (`/embed/details`).
- Compartir películas, series, temporadas y episodios (`/api/share/*`).
- Sincronización de Prime Video y Crunchyroll; indicador de versión en la APK.

### Mejoras
- Diseño de tablet (navbar, modales, FeaturedHero).
- Calidad de imagen selectiva en tarjetas y fichas.
- Metacritic y Rotten Tomatoes en la ficha.

## Agosto de 2026

### Nuevo
- **Sección Recomendaciones** (`/recommendations`): baraja para deslizar con descartes guardados en el backend.
- **Niveles, rangos y logros** del perfil. → [niveles-y-logros](docs/features/niveles-y-logros.md)
- **Sección Social** (`/social`): feed de actividad de los seguidos y propia.
- **App Android completa** (WebView + sincronización), con ajustes del login de Google.
- **Comentarios nativos** en la ficha, con pestañas y «me gusta». → [comunidad](docs/features/comunidad.md)
- Continuar viendo y Completadas como páginas propias en escritorio.

### Mejoras
- Estilo *liquid glass* unificado en navbar, menús y botones.
- Rewatches y fechas personalizadas en el modal de episodios vistos.
- Deslizar entre fichas en móvil; plataformas y enlaces en temporadas y episodios.

## Julio de 2026 (desde el 7)

### Nuevo
- **Contenido de comunidad en el backend propio:** comentarios, sentimiento y listas sembrados desde Trakt y servidos desde PostgreSQL. **Calendario** de episodios sin Trakt.
- **Perfiles públicos** `/u/[username]`, seguir/dejar de seguir y **Miembros** (`/members`).
- **Sincronización de streaming:** rewatches al cruzar el 90 %, detección en Prime Video y Max, progreso en «Continuar viendo».
- Primera fase de la **PWA offline**.
- Dashboard estilo Netflix: filas de backdrops alternadas con pósters y **vista previa** con tráiler.
- Fichas con DetailModal central y lateral, animaciones de entrada y vista móvil rediseñada.

### Mejoras
- Rediseño de las páginas de perfil e historial, indicador hover en tarjetas, navbar que encoge con el scroll.
