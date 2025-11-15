// src/components/StarRating.jsx
'use client'

import { useState } from 'react'
import { StarIcon, XIcon } from 'lucide-react' // Importar XIcon

/**
 * Componente de 5 estrellas con selección de medias estrellas.
 * Muestra la nota (1-10) y un botón para borrar.
 */
export default function StarRating({
  rating, // Puntuación actual (1-10) or null
  onRating, // Función al hacer click, devuelve (1-10)
  onClearRating, // Función para borrar la nota
  disabled = false
}) {
  // Estado para el hover, también en escala 1-10
  const [hoverValue, setHoverValue] = useState(0)

  // El valor a mostrar (1-10), ya sea el guardado o el del hover
  const displayValue = hoverValue || rating || 0

  const handleClear = (e) => {
    e.stopPropagation() // Evitar que el click se propague
    if (!disabled && onClearRating) {
      onClearRating()
    }
  }

  return (
    // Contenedor principal que alinea estrellas, texto y botón
    <div className={`flex items-center gap-3 ${disabled ? 'opacity-60' : ''}`}>
      {/* Contenedor de las 5 estrellas */}
      <div
        className={`flex items-center gap-1 ${
          disabled ? 'cursor-not-allowed' : ''
        }`}
        // Resetea el hover cuando el mouse sale del contenedor de estrellas
        onMouseLeave={() => !disabled && setHoverValue(0)}
      >
        {[1, 2, 3, 4, 5].map((starIndex) => {
          // starIndex es 1, 2, 3, 4, 5
          // Mapeamos a los valores 1-10 de TMDb
          const valueLeft = starIndex * 2 - 1 // 1, 3, 5, 7, 9
          const valueRight = starIndex * 2 // 2, 4, 6, 8, 10

          // Determinamos el porcentaje de relleno para esta estrella
          let fillPercentage = 0
          if (displayValue >= valueRight) {
            fillPercentage = 100 // Estrella completa
          } else if (displayValue >= valueLeft) {
            fillPercentage = 50 // Media estrella
          }

          return (
            <button
              key={starIndex}
              type="button"
              disabled={disabled}
              className="relative p-0 bg-transparent border-none cursor-pointer disabled:cursor-not-allowed"
              aria-label={`Puntuar ${starIndex} estrellas`}
            >
              {/* Icono base (vacío) */}
              <StarIcon className="w-8 h-8 text-gray-600" />

              {/* Relleno (se superpone) */}
              <div
                className="absolute top-0 left-0 h-full overflow-hidden"
                style={{ width: `${fillPercentage}%` }}
              >
                <StarIcon className="w-8 h-8 text-yellow-400 fill-yellow-400" />
              </div>

              {/* Mitad izquierda (para hover y click) - SIN title */}
              <span
                className="absolute top-0 left-0 z-10 w-1/2 h-full"
                onMouseEnter={() => !disabled && setHoverValue(valueLeft)}
                onClick={() => !disabled && onRating(valueLeft)}
              />
              {/* Mitad derecha (para hover y click) - SIN title */}
              <span
                className="absolute top-0 right-0 z-10 w-1/2 h-full"
                onMouseEnter={() => !disabled && setHoverValue(valueRight)}
                onClick={() => !disabled && onRating(valueRight)}
              />
            </button>
          )
        })}
      </div>

      {/* Indicador de nota (a la derecha) */}
      {typeof rating === 'number' && (
        <span className="font-semibold text-white text-lg">
          {rating.toFixed(1).replace(/\.0$/, '')}
        </span>
      )}

      {/* Botón para eliminar (a la derecha) */}
      {typeof rating === 'number' && !disabled && (
        <button
          onClick={handleClear}
          disabled={disabled}
          title="Quitar nota"
          className="p-1 rounded-full text-gray-400 hover:text-red-400 hover:bg-neutral-700 transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}