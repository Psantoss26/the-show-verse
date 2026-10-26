// netflix-page.js — Se ejecuta en el MUNDO DE LA PÁGINA de Netflix (manifest:
// "world": "MAIN"), el único que ve `window.netflix`. Publica cada segundo, solo
// en el reproductor (/watch/), qué vídeo suena según el propio reproductor. No
// lee nada más ni hace peticiones: el content script valida el mensaje y pide
// los metadatos (ver netflix-source.js).
(function () {
  const N = self.TSVNetflix;
  if (!N || self.__tsvNetflixPage) return;
  self.__tsvNetflixPage = true;

  setInterval(() => {
    if (document.hidden || !/^\/watch\//.test(location.pathname)) return;
    const state = N.readPlayerState(window.netflix);
    if (!state) return;
    window.postMessage({ source: N.PLAYER_MESSAGE, ...state }, location.origin);
  }, 1000);
})();
