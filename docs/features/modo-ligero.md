---
tags: [area/features, area/frontend, type/referencia]
aliases: [Modo ligero, Rendimiento visual, data-sv-lite]
---
# Modo ligero (dispositivos lentos)

En algunos dispositivos modestos la web iba a tirones: el scroll y las animaciones parecían ir a cámara lenta. Casi todo ese coste es el cristal (`backdrop-filter`): cada zona con desenfoque de fondo se vuelve a calcular en cada fotograma en el que se mueve lo que tiene detrás. Un equipo potente lo aguanta sin problema; uno modesto baja a 20-30 fps.

El modo ligero quita esos desenfoques **solo en los dispositivos que lo necesitan**. En un equipo que va fluido no cambia nada: se ve y se comporta exactamente igual.

## Qué ve el usuario

- En un dispositivo lento, tras unos segundos de uso con scroll (sobre todo si va a tirones de forma sostenida), los paneles, barras y botones de cristal pasan a verse esmerilados sin desenfoque: los tintes se quedan. Las barras que flotan sobre el contenido (barra inferior del móvil, barra lateral de escritorio, menú lateral y barra superior al desplazarse) llevan un tinte más oscuro para que los iconos se lean sin el desenfoque.
- Es lo mismo que ya hacía siempre la app nativa de Android (`data-android-app`).
- **Ajustes → Efectos visuales en este dispositivo**: *Automático* (por defecto), *Completa* (siempre con todos los efectos) o *Ligera* (siempre sin desenfoques). La elección es de este dispositivo, no de la cuenta, y funciona sin conexión. Volver a *Automático* olvida lo medido y el dispositivo vuelve a la calidad completa hasta que se mida de nuevo.

## Cómo se decide

- `PerformanceModeManager` (montado en el layout raíz) mide los intervalos entre fotogramas **solo mientras algo se desplaza** (la página, un carrusel o un panel); en reposo no corre nada. Los primeros 3 s tras cargar no cuentan.
- Una racha de scroll va a tirones si al menos el 20 % de sus fotogramas tarda ≥ 50 ms (no 33 ms: el ahorro de batería limita a 30 Hz sin que la página vaya mal). Las rachas de menos de 15 fotogramas o con la pestaña oculta se descartan.
- El dispositivo pasa a ligero cuando, de sus últimas 10 rachas (al menos 8 medidas, aunque vengan de varias visitas), 6 o más van a tirones. Un pico suelto no basta.
- También de entrada si el navegador declara ≤ 2 GB de memoria (`navigator.deviceMemory`, solo Chromium).
- Un script plano del `<head>` aplica `data-sv-lite` en `<html>` antes del primer pintado, así un dispositivo ya marcado no ve el cristal aparecer y desaparecer al cargar.

## Dónde vive

- Lógica, umbrales y script del `<head>`: `src/lib/ui/performanceMode.js` (pruebas en `performanceMode.test.mjs`).
- Medición: `src/components/PerformanceModeManager.jsx`.
- Ajuste: `src/components/settings/PerformanceModeSetting.jsx`, en Ajustes.
- Reglas CSS: `html[data-sv-lite]` en `src/app/globals.css`, junto a las de `data-android-app`.
- Almacenamiento (localStorage): `sv-perf-mode` (`full` | `lite`; sin clave = automático) y `sv-perf-probe-v1` (rachas medidas y veredicto).

## Relacionado
- [[Features]]
- [[app-router-pages]]
- [[Companion-Apps]]
