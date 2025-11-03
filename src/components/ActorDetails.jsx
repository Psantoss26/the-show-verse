'use client'

import { useState } from 'react';
import { LinkIcon, ImageOff } from 'lucide-react';

export default function ActorDetails({ actorDetails, actorMovies }) {
  const [showFullBio, setShowFullBio] = useState(false); // Estado para mostrar la biografía completa

  return (
    <div className="p-8 max-w-6xl mx-auto text-white">
      {/* Contenedor de detalles del actor */}
      <div className="flex flex-col lg:flex-row gap-8 mb-12">
        {/* Imagen del actor */}
        <div className="w-full lg:w-1/3 max-w-sm flex flex-col gap-4">
          {actorDetails.profile_path ? (
            <img 
              src={`https://image.tmdb.org/t/p/w500${actorDetails.profile_path}`} 
              alt={actorDetails.name} 
              className="rounded-lg shadow-lg w-full h-auto object-cover"
            />
          ) : (
            <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center rounded-lg shadow-lg">
              <ImageOff size={64} className="text-gray-500" />
            </div>
          )}
        </div>

        {/* Información del actor */}
        <div className="flex-1 flex flex-col gap-6">
          <h1 className="text-4xl font-bold mb-4">{actorDetails.name}</h1>

          <div className="mb-4">
            <div 
              className="text-gray-300 overflow-hidden" 
              style={{ 
                maxHeight: showFullBio ? 'none' : '310px',  // Ajuste de altura máxima
                transition: 'max-height 0.3s ease', 
                overflowY: 'hidden' 
              }}>
              <p>{actorDetails.biography || 'Sin biografía disponible.'}</p>
            </div>
            {!showFullBio && actorDetails.biography && (
              <button 
                className="mt-2 text-blue-400 hover:underline"
                onClick={() => setShowFullBio(true)}
              >
                Leer más
              </button>
            )}
          </div>

          <div className="text-base bg-gray-900 rounded-lg p-4 shadow-md text-gray-300">
            {actorDetails.imdb_id && (
              <p> 
                <a href={`https://www.imdb.com/name/${actorDetails.imdb_id}`} target="_blank" className="text-yellow-400 hover:underline flex items-center">
                <LinkIcon className="inline w-4 h-4 mr-2 text-yellow-300"/>
                <strong>Enlace IMDb</strong>
                </a>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filmografía del actor */}
      {actorMovies.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-white mb-4">Filmografía</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {actorMovies.map(movie => (
              <a 
                key={movie.id} 
                href={`/details/movie/${movie.id}`} // Redirigir al detalle de la película
                className="group bg-gray-800 hover:bg-gray-700 rounded-lg overflow-hidden"
              >
                {movie.poster_path ? (
                  <img 
                    src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`} 
                    alt={movie.title} 
                    className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full aspect-[2/3] bg-gray-800 flex items-center justify-center">
                    <ImageOff size={48} className="text-gray-500" />
                  </div>
                )}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
