'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  getDetails,
  getRecommendations,
  getCredits,
  getProviders,
  getReviews
} from '@/lib/api/tmdb'
import DetailsClient from '@/components/DetailsClient'

export default function TvDetailsPage() {
  const { id } = useParams()

  const [data, setData] = useState(null)
  const [recommendations, setRecommendations] = useState([])
  const [castData, setCastData] = useState([])
  const [providers, setProviders] = useState([])
  const [reviews, setReviews] = useState([])

  useEffect(() => {
    const fetchDetails = async () => {
      const details = await getDetails('tv', id)
      setData(details)

      const [
        recs,
        revs,
        provs,
        cast
      ] = await Promise.all([
        getRecommendations('tv', id),
        getReviews('tv', id),
        getProviders('tv', id),
        getCredits('tv', id)
      ])

      setRecommendations(recs?.results || [])
      setReviews(revs?.results || [])
      setProviders(provs?.results?.ES?.flatrate || [])
      setCastData(cast?.cast || [])
    }

    fetchDetails()
  }, [id])

  if (!data) return null

  return (
    <DetailsClient
      type="tv"
      id={id}
      data={data}
      recommendations={recommendations}
      castData={castData}
      providers={providers}
      reviews={reviews}
    />
  )
}
