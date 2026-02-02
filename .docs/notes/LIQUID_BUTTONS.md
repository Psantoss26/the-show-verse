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
