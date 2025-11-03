'use client'
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation'; 
import {
  getDetails,
  getRecommendations,
  getCredits,
  getProviders,
  getReviews,
  getActorMovies
} from '@/lib/api/tmdb';
import DetailsClient from '@/components/DetailsClient';

export default function DetailsPage() {
  const { type, id } = useParams();

  const [renderReady, setRenderReady] = useState(false);
  const [propsToRender, setPropsToRender] = useState({});

  useEffect(() => {
    const fetchAll = async () => {
      if (!type || !id) return;

      try {
        const details = await getDetails(type, id);

        if (type === 'person') {
          const actorMovies = await getActorMovies(id);
          setPropsToRender({
            type,
            id,
            data: details,
            castData: actorMovies?.cast || [],
            recommendations: [],
            providers: [],
            reviews: []
          });
        } else {
          // Llamadas en paralelo
          const [cast, recommendations, reviews, providers] = await Promise.all([
            getCredits(type, id),
            getRecommendations(type, id),
            getReviews(type, id),
            getProviders(type, id),
          ]);

          setPropsToRender({
            type,
            id,
            data: details,
            castData: cast?.cast || [],
            recommendations: recommendations?.results || [],
            reviews: reviews?.results || [],
            providers: providers?.results?.ES?.flatrate || [],
          });
        }

        setRenderReady(true);
      } catch (err) {
        console.error('Error cargando detalles:', err);
      }
    };

    fetchAll();
  }, [type, id]);

  // Hasta tener todo, no renderiza nada
  if (!renderReady) return null;

  return <DetailsClient {...propsToRender} />;
}
