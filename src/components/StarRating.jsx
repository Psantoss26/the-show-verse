// src/components/StarRating.jsx
'use client'

import { useState } from 'react'
import { StarIcon, XIcon } from 'lucide-react'

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
      className={`flex items-center flex-nowrap gap-2 sm:gap-3 ${disabled ? 'opacity-60' : ''
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
        <span className="font-semibold text-white text-base sm:text-lg whitespace-nowrap">
          {rating.toFixed(1).replace(/\.0$/, '')}
        </span>
      )}

      {typeof rating === 'number' && !disabled && (
        <button
          onClick={handleClear}
          disabled={disabled}
          title="Quitar nota"
          className="p-0.5 sm:p-1 rounded-full text-gray-400 hover:text-red-400 hover:bg-neutral-700 transition-colors shrink-0"
        >
          <XIcon className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      )}
    </div>
  )
}
