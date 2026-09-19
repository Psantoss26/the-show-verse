# Sincronización de streaming: recuperación y pruebas

Esta implementación refuerza la integración propia: extensión 2.9 y Android 1.2
(versionCode 3). Los fallos encontrados en reintentos, cambios de episodio,
persistencia y vinculación eran corregibles sin sustituir el sistema.

## Flujo

1. El reproductor aporta título, episodio y posición; el servidor resuelve TMDb.
2. Cada cliente guarda los puntos de progreso antes de enviarlos. Si no pudo
   resolver el título, guarda la observación para resolverla al recuperar conexión.
3. Los reintentos conservan `eventId` y `observedAt`. La extensión usa almacenamiento
   persistente y alarmas; Android usa preferencias cifradas y WorkManager.
4. El backend serializa las escrituras de cada usuario/contenido en una transacción,
   conserva recibos de eventos e ignora puntos anteriores al último confirmado.
   Repetir un envío no duplica el historial ni resucita un episodio completado.
5. Se conserva el umbral de finalización del 90%. Una posición estimada no marca
   un visionado completo. Verlo de nuevo después sigue pudiendo crear otro visionado.

Las respuestas de resolución de un episodio anterior no pueden modificar el nuevo.
Los fallos de resolución se reintentan con espera creciente. Las observaciones
que siguen sin resolverse tras tres respuestas 404/422 se descartan con diagnóstico
para no bloquear toda la cola. Los fallos de red y servidor se conservan.

Cada dispositivo tiene una vinculación independiente, asociada al usuario de
The Show Verse. Compartir un correo de Netflix no transfiere la vinculación entre
usuarios. Cambiar de cuenta elimina los pendientes de la vinculación anterior.
La desconexión global de ajustes revoca todos los dispositivos.

## Activación

1. Comprobar las variables reales del backend y ejecutar `npm --prefix backend run
   deploy:check`. En esta sesión la configuración existente falló al conectar con
   PostgreSQL y Redis; la comprobación sí pasó con servicios locales aislados.
   No se cambiaron las credenciales ni se migró producción.
2. Aplicar `npm --prefix backend run db:migrate` en el entorno de destino. La
   migración aditiva `0016_calm_hannibal_king.sql` crea `streaming_events`. El comando
   de arranque actual del backend también aplica las migraciones pendientes.
3. Desplegar backend y frontend antes de actualizar los clientes.
4. En Chrome, actualizar la extensión o descomprimir el ZIP y cargar la carpeta
   desde `chrome://extensions` con el modo de desarrollador. Conceder acceso a
   los sitios de streaming elegidos, volver a vincular desde ajustes y recargar
   las pestañas de los reproductores.
5. Instalar el APK de Android, vincular desde ajustes y habilitar el acceso a
   notificaciones. Habilitar accesibilidad si se necesita su detección auxiliar.
   El APK generado es de depuración: una instalación firmada con otra clave
   requiere el proceso de actualización con su clave original o una instalación
   independiente. No se ha publicado ni firmado una versión de distribución.

La extensión muestra pendientes y el último error. Android muestra el número de
pendientes y registra las confirmaciones. «Guardado para sincronizar» indica cola
local, no confirmación del servidor. Las colas admiten 1000 eventos; al llenarse se
informa del fallo en lugar de borrar eventos antiguos silenciosamente.

## Validación reproducible

```sh
node --test netflix-extension/*.test.* src/lib/netflix/*.test.mjs
npm --prefix backend test
npm run lint
npm run build
```

La prueba de integración usa PostgreSQL real y requiere una base **desechable** con
las migraciones aplicadas. No usar la base de producción:

```sh
STREAMING_TEST_DATABASE_URL=postgresql://USER:PASS@HOST/TEST_DB \
  node --test backend/src/routes/streamingProgress.integration.test.js
```

Android, con JDK 17, Gradle 8.7 y Android SDK instalado:

```sh
cd android-companion
gradle testDebugUnitTest assembleDebug
```

Se comprobaron automáticamente persistencia y reintentos de la extensión,
respuestas tardías entre episodios, cierre antes de resolución, observaciones
sin conexión, coincidencias ambiguas, escrituras concurrentes, repetición de
eventos, progreso antiguo, visionados repetidos, tokens revocados y vinculaciones
independientes. También se compilaron la web y el APK y se ejecutaron los tests JVM.

## Matriz de comprobación con cuentas reales

Repetir estos casos en cada servicio habilitado en navegador y Android. Estas
pruebas con reproductores reales quedan pendientes; las pruebas automatizadas
no certifican el comportamiento de aplicaciones externas.

| Caso | Resultado esperado |
| --- | --- |
| Película al 30% y al 95% | Progreso primero; un solo visionado al finalizar |
| Autoplay al siguiente episodio | Cada punto pertenece a su episodio |
| Cortar red, avanzar y reconectar | Pendientes enviados con la hora original |
| Cerrar pestaña o app después de guardar | La cola persiste y se recupera |
| Respuesta perdida y reenvío | No duplica el historial |
| Pausar y reanudar sincronización | No envía mientras está pausada |
| Revocar token | Informa de revinculación, sin dar por enviado el progreso |
| Dos dispositivos y cuenta de streaming compartida | Vinculaciones independientes |
| Título o episodio ambiguo | No inventa una coincidencia segura |
| Posición estimada de accesibilidad | No completa automáticamente el visionado |

## Límites y alternativa

Este sistema observa reproducción en dispositivos vinculados. No importa por sí
solo el historial completo de una cuenta ni lo visto en televisores o dispositivos
sin la integración. Las plataformas pueden ocultar o cambiar sus metadatos;
Android puede restringir la ejecución y diferir WorkManager. La recuperación
periódica de Android es de 15 minutos y no garantiza una hora exacta de envío.
Forzar la detención de Android requiere abrir de nuevo la aplicación.

No se puede garantizar compatibilidad universal con todas las plataformas. Para
evaluar importación de cuentas mediante Younify Connect haría falta acceso real
de partner, documentación y claves del proveedor. No se ha añadido una integración
simulada ni se ha contratado un servicio. La implementación propia queda lista
para comparar sus resultados con esa alternativa cuando se disponga de acceso.

Referencias: [ciclo de vida de extensiones](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
[trabajo persistente Android](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work).
