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
2. Añade arriba el campo `expected` con lo que **debería** detectarse:

   ```json
   "expected": { "showName": "The Boys", "season": 2, "episode": 3 }
   ```

   Para una película: `{ "movieTitle": "Dune: Parte Dos" }`.
3. `node --test netflix-extension/diagnostic.test.js` la comprueba con el código
   actual.

Para ver qué detectó el navegador y qué detecta el código ahora:

```sh
node netflix-extension/diagnostic-replay.js netflix-extension/diagnostics/prime-the-boys-t2e3.json
```
