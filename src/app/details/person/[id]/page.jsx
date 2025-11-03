'use client'

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';  // Asegúrate de usar el hook `useParams` de Next.js
import { getActorDetails, getActorMovies } from '@/lib/api/tmdb'; // Asegúrate de tener estas funciones implementadas
import ActorDetails from '@/components/ActorDetails'; // Importa el nuevo componente ActorDetails

// Componente para mostrar los detalles de un actor
export default function ActorDetailsPage() {
  const { id } = useParams(); // Obtener el ID del actor desde la URL
  const [actorDetails, setActorDetails] = useState(null);
  const [actorMovies, setActorMovies] = useState([]);

  useEffect(() => {
    const fetchActorDetails = async () => {
      try {
        // Obtener detalles del actor
        const details = await getActorDetails(id);
        setActorDetails(details);

        // Obtener la filmografía del actor
        const movies = await getActorMovies(id);
        setActorMovies(movies.cast || []);  // Usamos `cast` en caso de que los resultados vengan en esa clave
      } catch (error) {
        console.error('Error fetching actor details:', error);
      }
    };

    if (id) {
      fetchActorDetails();
    }
  }, [id]);

  if (!actorDetails) return <div>Loading...</div>; // Cargar datos antes de mostrar la vista

  return (
    <ActorDetails
      actorDetails={actorDetails} 
      actorMovies={actorMovies} 
    />
  );
}
