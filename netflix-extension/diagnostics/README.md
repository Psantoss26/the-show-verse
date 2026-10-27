# Capturas de diagnóstico

Capturas reales hechas con **Capturar diagnóstico** en la ventana de la extensión
(ver `diagnostic-capture.js`). Cada una guarda lo que lee la detección en una
pestaña: URL sin parámetros de sesión, título, Media Session, JSON-LD, metas
públicas, el `<video>` y el DOM con texto.

**Antes de subir una captura**, revísala: no lleva cookies ni tokens, pero sí
texto de la página (por ejemplo, el nombre del perfil).

## Convertirla en una prueba

1. Copia el `.json` aquí con un nombre que diga qué es, p. ej.
   `prime-the-boys-t2e3.json`.
2. Redúcela con `slimCapture` de `diagnostic-replay.js` (solo lo que lee la
   detección, sin el resto del texto de la página) y añade `expected` con lo que
   **debería** detectarse y su tipo (`kind`):

   ```json
   "expected": { "kind": "playback", "showName": "The Boys", "season": 2, "episode": 3 }
   ```

   `kind`: `"detail"` (ficha), `"playback"` (reproducción) o `"none"` (portada o
   listado: no debe detectarse nada). Para una película: `"movieTitle"`. Los
   campos que no se indican no deben aparecer (una serie no puede salir película).
3. `node --test netflix-extension/diagnostic.test.js` la comprueba con el código
   actual.

Para ver qué detectó el navegador y qué detecta el código ahora:

```sh
node netflix-extension/diagnostic-replay.js netflix-extension/diagnostics/prime-the-boys-t2e3.json
```
