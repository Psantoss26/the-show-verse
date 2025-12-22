// src/components/StarRating.jsx
'use client'

import { useState } from 'react'
import { StarIcon, Eraser } from 'lucide-react'

export default function StarRating({
  rating,
  onRating,
  onClearRating,
  disabled = false
}) {
  const [hoverValue, setHoverValue] = useState(0)
  const displayValue = hoverValue || rating || 0

  const handleClear = (e) => {
    e.stopPropagation()
    if (!disabled && onClearRating) onClearRating()
  }

  return (
    <div
      className={`flex items-center flex-nowrap gap-2 sm:gap-3 whitespace-nowrap ${disabled ? 'opacity-60' : ''
        }`}
    >
      <div
        className={`flex items-center flex-nowrap gap-0.5 sm:gap-1 ${disabled ? 'cursor-not-allowed' : ''
          }`}
        onMouseLeave={() => !disabled && setHoverValue(0)}
      >
        {[1, 2, 3, 4, 5].map((starIndex) => {
          const valueLeft = starIndex * 2 - 1
          const valueRight = starIndex * 2

          let fillPercentage = 0
          if (displayValue >= valueRight) fillPercentage = 100
          else if (displayValue >= valueLeft) fillPercentage = 50

          return (
            <button
              key={starIndex}
              type="button"
              disabled={disabled}
              className="relative p-0 bg-transparent border-none cursor-pointer disabled:cursor-not-allowed shrink-0"
              aria-label={`Puntuar ${starIndex} estrellas`}
            >
              <StarIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-gray-600" />

              <div
                className="absolute top-0 left-0 h-full overflow-hidden"
                style={{ width: `${fillPercentage}%` }}
              >
                <StarIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 lg:w-8 lg:h-8 text-yellow-400 fill-yellow-400" />
              </div>

              <span
                className="absolute top-0 left-0 z-10 w-1/2 h-full"
                onMouseEnter={() => !disabled && setHoverValue(valueLeft)}
                onClick={() => !disabled && onRating(valueLeft)}
              />
              <span
                className="absolute top-0 right-0 z-10 w-1/2 h-full"
                onMouseEnter={() => !disabled && setHoverValue(valueRight)}
                onClick={() => !disabled && onRating(valueRight)}
              />
            </button>
          )
        })}
      </div>

      {typeof rating === 'number' && (
        <span className="font-semibold text-white text-base sm:text-lg shrink-0">
          {rating.toFixed(1).replace(/\.0$/, '')}
        </span>
      )}

      {typeof rating === 'number' && !disabled && (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          title="Borrar puntuación"
          aria-label="Borrar puntuación"
          className={`ml-1 inline-flex items-center justify-center
            w-8 h-8 sm:w-9 sm:h-9 rounded-full border transition shrink-0
            ${disabled
              ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
              : 'bg-white/5 border-white/15 text-zinc-200 hover:bg-white/10 hover:border-red-500/40 hover:text-red-300'
            }`}
        >
          <Eraser className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
        </button>
      )}
    </div>
  )
}
