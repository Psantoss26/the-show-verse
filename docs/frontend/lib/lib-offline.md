---
tags: [area/frontend, type/referencia, capa/lib]
---
# Consulta sin conexión

La PWA conserva una copia de consulta del usuario en el navegador. Detecta también la caída del NAS aunque el dispositivo siga conectado a Internet. Las acciones que modifican datos se bloquean; no se guardan ni se reenvían cambios pendientes al recuperar conexión.

## Preparación

El service worker se activa en producción (`npm run build` y `npm start`), en HTTPS o localhost. En `npm run dev` se desactiva para evitar servir código antiguo durante el desarrollo.

Tras iniciar sesión, `OfflineManager` prepara en segundo plano las páginas personales, las secciones paginadas del perfil, las listas y los estados de los títulos. Las páginas de detalles se guardan en cuanto se muestran sus datos; `useOfflineTitle` encarga al service worker las consultas complementarias y temporadas. El trabajo continúa aunque se cierre la ficha o se cambie de página. Ajustes del perfil muestra el resultado de la preparación y permite repetirla. Conviene esperar a que termine antes de apagar el servidor.

La copia representa la última información descargada en ese navegador. No puede proporcionar títulos nunca visitados, actualizaciones posteriores a la desconexión ni contenido de servicios externos que no se haya descargado. Vídeos, reproducción y servicios externos requieren su propia disponibilidad. El navegador puede borrar datos por falta de espacio o por una limpieza del usuario; se solicita almacenamiento persistente y se informa de errores de cuota o preparación incompleta.

## Componentes

| Archivo | Responsabilidad |
| --- | --- |
| `public/sw.js` | Documentos, recursos y lecturas API; copias privadas por cuenta, paginación local y bloqueo de escrituras. |
| `src/lib/offline/prepare.js` | Preparación completa de colecciones, estados de tarjetas y documentos personales. |
| `src/lib/offline/useOfflineTitle.js` | Preparación de los detalles visitados y sus consultas asociadas. |
| `src/components/OfflineManager.jsx` | Preparación, navegación entre documentos guardados y bloqueo de controles de edición. |
| `src/context/ServerStatusContext.jsx` | Sondeo de salud del frontend y backend; recuperación automática. |
| `src/lib/offline/syncQueue.js` | Compatibilidad con consumidores antiguos; descarta la cola antigua y exige conexión para modificar datos. |

Las respuestas de red válidas actualizan las copias. Ante errores de conexión, 408, 429 o 5xx se recupera la copia disponible; un 401/403 no se sustituye por una respuesta autenticada antigua. Las sesiones y los enlaces de autenticación no se almacenan como respuestas reutilizables. El cierre o cambio de cuenta elimina las copias privadas. Las respuestas Next Flight no se reproducen fuera de su contexto: la navegación offline utiliza documentos completos y los recursos correspondientes a su versión.

Favoritos, watchlist, valoraciones y vistos conservan su estado visual mientras sus acciones quedan deshabilitadas. La navegación, las pestañas y los filtros locales siguen disponibles. Antes de abrir enlaces, fichas o navegar mediante botones sin conexión se comprueba que exista un documento guardado para la cuenta. Si no existe, se mantiene la vista actual sin cambiar la URL ni mostrar avisos. Las navegaciones directas no interceptadas reciben HTTP 204, que conserva el documento actual en el navegador; no se sirve una pantalla alternativa. Una pestaña nueva sin ninguna página cargada no puede mostrar contenido que nunca se descargó.

## Verificación

Ejecutar `node --test src/lib/offline/*.test.mjs`, `npm run lint` y `npm run build`.

Para comprobar el comportamiento real:

1. Arrancar una compilación de producción local con el backend disponible e iniciar sesión.
2. Esperar la preparación en Ajustes y visitar un detalle de película y otro de serie.
3. Detener únicamente el servidor web de prueba, manteniendo Internet disponible.
4. Cerrar y abrir el navegador con el mismo perfil. Abrir directamente los detalles guardados, el perfil y sus secciones, historial, favoritos, watchlist y listas.
5. Verificar datos y estados visuales, paginación y bloqueo de modificaciones.
6. Arrancar de nuevo el servidor y comprobar que desaparece el aviso de solo lectura y no se reenvían operaciones.

Las pruebas automatizadas cubren errores de origen y de integraciones, cuentas y respuestas en vuelo, documentos exactos, estados solicitados en lotes distintos, paginación de colecciones e historial, respuestas inválidas y bloqueo de mutaciones.
