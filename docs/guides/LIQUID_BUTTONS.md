# Liquid Buttons - Implementación

## Descripción

Sistema de botones con efecto de gotas/cristal líquido que se activa al hacer hover. Las animaciones solo se ejecutan cuando el botón está en hover o activo, asegurando un rendimiento óptimo.

## Componente Creado

### LiquidButton.jsx

Botón individual con efectos líquidos:

- **Ondulaciones (ripples)**: Efecto de gota que se expande al hacer hover/click
- **Partículas flotantes**: Movimiento orgánico dentro del botón
- **Brillo de cristal**: Reflejo animado tipo cristal líquido
- **Propagación**: Las ondulaciones se propagan a botones cercanos (< 200px)
- **5 temas de color**: blue, red, yellow, purple, green

## Variante de cristal de las fichas (`liquidGlass`)

Los botones de acción de las fichas (`DetailActionsRow`, `SubrouteDetailsActionRow`, `ActorDetails`, `WatchNextAssistant`, y `StarRating`/`TraktWatchedControl` cuando reciben `liquidGlass`) usan `<LiquidButton liquidGlass>`. En esta variante **no** corren los efectos de abajo (canvas, partículas, ondas, explosión, propagación al grupo, brillo y pulso infinitos): sus estados son CSS (`.sv-lg-btn` en `src/app/globals.css`) y el puntero no provoca renders de React.

| Estado | Cómo se ve | Cómo se activa |
| --- | --- | --- |
| Reposo | Cristal de la familia (`LIQUID_GLASS_SURFACE_CARD` + `LiquidGlassOpticalLayers`) más `.sv-lg-sheen`: un lóbulo de luz arriba y penumbra abajo con degradados radiales que mueren antes del borde | siempre |
| Activo | `.sv-lg-tint`: cristal teñido con el color de `activeColor` (`--lg-rgb`/`--lg-rgb2`) y halo exterior fijo del mismo color, sin aro interior | `data-active` (prop `active`) |
| Hover | Sube 1 px y escala a 1,06 (1,025 en los `labeled`); `.sv-lg-spec` dibuja un reflejo que sigue al puntero (`--lg-mx`/`--lg-my`) | solo `@media (hover: hover) and (pointer: fine)`, para que en táctil no se quede pegado |
| Pulsado | Se hunde a 0,92 (0,965 en `labeled`) en 110 ms; `.sv-lg-press` ilumina desde el punto de contacto (`--lg-px`/`--lg-py`); al soltar vuelve con un muelle (460 ms) | `data-pressed` entre `pointerdown` y `pointerup`/`cancel`/`leave` |
| Foco | Anillo blanco de 2 px separado 3 px | `:focus-visible` |

**Sin cantos marcados.** Nada sigue el contorno del botón: ni sombras `inset` (dibujan una línea clara arriba y otra oscura abajo alrededor del círculo), ni aro de 1 px en el activo, ni el canto de refracción `.sv-glass-rim` de `LiquidGlassOpticalLayers` (que `.sv-lg-btn` oculta: en piezas de 40-56 px su franja se lee como un aro claro). El volumen sale solo de degradados interiores; el límite del botón es el paso de cristal a fondo.

Los botones de relleno blanco (`className` con `!bg-white`: tráiler y soundtrack) llevan `data-solid`: no se tiñen, y el reflejo y el destello van en oscuro.

Solo se transicionan `transform` y las opacidades de las capas; `box-shadow` y `backdrop-filter` cambian sin transición porque en una fila de nueve botones de cristal es lo más caro. Con `prefers-reduced-motion` no hay escala ni elevación.

**Números centrados por su tinta.** Los números de dentro de los botones (veces vista, progreso de serie con su «%», la nota decimal de `StarRating`) se centran por lo que se dibuja, no por su caja: flexbox centra cajas, y la caja de línea reserva más arriba que abajo, cada cifra tiene márgenes laterales propios, `tracking-tighter` deja espacio negativo tras la última cifra y el «%» pequeño pesa a la derecha. `useCenteredGlyphOffset(text)` (`src/hooks/`) devuelve `{ ref, style }` para el elemento del número (o el grupo número+«%»); mide con `measureInkCenterShift` (`src/lib/ui/measureGlyphOffset.js`) dónde empieza cada trozo de texto y su línea base (sonda 0×0) y, con Canvas a 10× para no heredar su redondeo al píxel, qué ocupa la tinta; aplica un `translate(x, y)` en cuartos de píxel que lleva la unión de tintas al centro del botón. Vuelve a medir si cambia el texto, el tamaño del botón o del número, o al cargar las fuentes, y descuenta la escala de hover/pulsado. Medido en capturas a 2×: antes la tinta quedaba hasta 1,25 px fuera del centro; ahora ≤0,25 px en el ordenador y ≤0,6 px en el móvil (el botón de 41,25 px cae a medio píxel físico y Chrome ajusta el texto a la rejilla del dispositivo).

Lo que sigue describe la variante clásica (sin `liquidGlass`), que siguen usando los botones de navegación y de ajustes.

## Uso

```jsx
import LiquidButton from "@/components/LiquidButton";

<LiquidButton
  onClick={handleClick}
  active={isActive}
  activeColor="red"
  disabled={isLoading}
  title="Mi botón"
>
  <Heart className="w-5 h-5" />
</LiquidButton>;
```

## Props

| Prop          | Tipo       | Default  | Descripción                                       |
| ------------- | ---------- | -------- | ------------------------------------------------- |
| `onClick`     | `function` | -        | Handler del click                                 |
| `disabled`    | `boolean`  | `false`  | Deshabilita el botón                              |
| `active`      | `boolean`  | `false`  | Estado activo (color persistente)                 |
| `activeColor` | `string`   | `'blue'` | Color: 'blue', 'red', 'yellow', 'purple', 'green' |
| `loading`     | `boolean`  | `false`  | Estado de carga                                   |
| `title`       | `string`   | `''`     | Tooltip                                           |
| `className`   | `string`   | `''`     | Clases CSS adicionales                            |

## Integración en DetailsClient

Los botones se han integrado en la barra de acciones principales:

- **Tráiler**: Amarillo
- **Favorito**: Rojo (active cuando está marcado)
- **Watchlist**: Azul (active cuando está en lista)
- **Listas**: Morado (active cuando está en alguna lista)
- **Toggle Fondo**: Amarillo (active cuando está visible)

## Optimización

- **Canvas solo en hover/active**: Las animaciones solo se ejecutan cuando son visibles
- **Cleanup automático**: Los ripples se eliminan después de completar la animación
- **RequestAnimationFrame**: Animación sincronizada a 60 FPS
- **Partículas limitadas**: Solo 8 partículas por botón
- **Propagación controlada**: Solo afecta botones a menos de 200px

## Características Técnicas

### Efectos Visuales

1. **Ripples**: Ondulaciones expansivas con gradiente radial
2. **Partículas**: Movimiento sinusoidal con rebote en bordes
3. **Brillo**: Gradiente diagonal animado
4. **Borde**: Pulso con escala 1.0 → 1.1

### Sistema de Propagación

- Evento personalizado `liquidSpread`
- Detección de distancia entre botones
- Delay basado en distancia para efecto cascada

### Colores (formato RGBA)

```javascript
blue: [59, 130, 246];
red: [239, 68, 68];
yellow: [234, 179, 8];
purple: [168, 85, 247];
green: [34, 197, 94];
```

## Archivos Modificados

1. **src/components/LiquidButton.jsx** (nuevo) - Componente del botón
2. **src/components/DetailsClient.jsx** - Integración en barra de acciones
