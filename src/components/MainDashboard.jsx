'use client'

import { useRef, useEffect, useState } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation, Autoplay } from 'swiper'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'
import { Anton } from 'next/font/google'
import CarruselIndividual from '@/components/CarruselIndividual'

// Funciones API
import {
  fetchTopRatedMovies,
  fetchCultClassics,
  fetchMindBendingMovies,
  fetchTopActionMovies,
  fetchPopularInUS,
  fetchUnderratedMovies,
  fetchRisingMovies,
  fetchTrendingMovies,
  fetchPopularMovies,
  fetchRecommendedMovies,
  getLogos
} from '@/lib/api/tmdb'

// Fuente
const anton = Anton({ weight: '400', subsets: ['latin'] })

export default function MainDashboard({ sessionId = null }) {
  const [ready, setReady] = useState(false)
  const [dashboardData, setDashboardData] = useState({})

  const prevRef = useRef(null)
  const nextRef = useRef(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [
          topRated,
          cult,
          mind,
          action,
          us,
          underrated,
          rising,
          trending,
          popular
        ] = await Promise.all([
          fetchTopRatedMovies(),
          fetchCultClassics(),
          fetchMindBendingMovies(),
          fetchTopActionMovies(),
          fetchPopularInUS(),
          fetchUnderratedMovies(),
          fetchRisingMovies(),
          fetchTrendingMovies(),
          fetchPopularMovies()
        ])

        const recommended = sessionId
          ? await fetchRecommendedMovies(sessionId)
          : []

        const topRatedWithLogos = await Promise.all(
          topRated.map(async (movie) => {
            const logo = await getLogos('movie', movie.id)
            return { ...movie, logo_path: logo }
          })
        )

        setDashboardData({
          topRated: topRatedWithLogos,
          cult,
          mind,
          action,
          us,
          underrated,
          rising,
          trending,
          popular,
          recommended
        })

        setReady(true)
      } catch (err) {
        console.error('Error cargando dashboard:', err)
      }
    }

    loadData()
  }, [sessionId])

  if (!ready) return null

  const sections = [
    { title: 'Populares', key: 'popular' },
    { title: 'Tendencias Semanales', key: 'trending' },
    { title: 'Guiones Complejos', key: 'mind' },
    { title: 'Top Acción', key: 'action' },
    { title: 'Populares en EE.UU.', key: 'us' },
    { title: 'Películas de Culto', key: 'cult' },
    { title: 'Infravaloradas', key: 'underrated' },
    { title: 'En Ascenso', key: 'rising' },
    
    ...(dashboardData.recommended?.length > 0
      ? [{ title: 'Recomendadas Para Ti', key: 'recommended' }]
      : [])
  ]

  return (
    <div className="px-8 py-2 text-white bg-black">
      {/* Carrusel principal: top valoradas + logos */}
      <div className="relative group mb-10 sm:mb-14">
        <Swiper
          spaceBetween={20}
          slidesPerView={3}
          autoplay={{ delay: 5000 }}
          navigation={{
            prevEl: prevRef.current,
            nextEl: nextRef.current
          }}
          onInit={(swiper) => {
            swiper.params.navigation.prevEl = prevRef.current
            swiper.params.navigation.nextEl = nextRef.current
            swiper.navigation.init()
            swiper.navigation.update()
          }}
          modules={[Navigation, Autoplay]}
          className="group relative" 
          breakpoints={{
            0: { slidesPerView: 1, spaceBetween: 12 },
            640: { slidesPerView: 2, spaceBetween: 16 },
            1024: { slidesPerView: 3, spaceBetween: 20 },
          }}                   
        >
          {dashboardData.topRated.map((movie) => (
            <SwiperSlide key={movie.id}>
              <Link href={`/details/movie/${movie.id}`}>
                <div className="cursor-pointer overflow-hidden rounded-lg">
                  <img
                    src={`https://image.tmdb.org/t/p/original${movie.backdrop_path}`}
                    alt={movie.title}
                    className="w-full h-full object-cover rounded-lg hover:scale-105 transition-transform duration-300"
                  />
                  {movie.logo_path && (
                    <img
                      src={`https://image.tmdb.org/t/p/w200${movie.logo_path}`}
                      alt={`${movie.title} logo`}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 h-18 object-contain max-w-[50%]"
                    />
                  )}
                </div>
              </Link>
            </SwiperSlide>
          ))}
            <div
  ref={prevRef}
  className="swiper-button-prev hidden sm:flex !text-white !w-8 !h-8 !items-center !justify-center group-hover:opacity-100 transition-opacity duration-300"
/>

<div
  ref={nextRef}
  className="swiper-button-next hidden sm:flex !text-white !w-8 !h-8 !items-center !justify-center group-hover:opacity-100 transition-opacity duration-300"
/>

          </Swiper>
      </div>

      {/* Carruseles adicionales */}
      <div className="space-y-12">
        {sections.map(({ title, key }) => (
          <div key={title} className="relative group">
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-[730] text-primary-text mb-4 sm:text-left">

              <span
                className={`bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase ${anton.className}`}
              >
                {title}
              </span>
            </h3>

            <Swiper
              spaceBetween={20}
              slidesPerView={10}
              navigation={{
                prevEl: prevRef.current,
                nextEl: nextRef.current
              }}
              onInit={(swiper) => {
                swiper.params.navigation.prevEl = prevRef.current
                swiper.params.navigation.nextEl = nextRef.current
                swiper.navigation.init()
                swiper.navigation.update()
              }}
              modules={[Navigation]}
              className="group relative"
              breakpoints={{
                0: { slidesPerView: 3, spaceBetween: 12 },
                480: { slidesPerView: 4, spaceBetween: 14 },
                768: { slidesPerView: 6, spaceBetween: 16 },
                1024: { slidesPerView: 8, spaceBetween: 18 },
                1280: { slidesPerView: 10, spaceBetween: 20 },
              }}                            
            >
              {dashboardData[key]?.map((movie) => (
                <SwiperSlide key={movie.id}>
                  <Link href={`/details/movie/${movie.id}`}>
                    <div className="cursor-pointer overflow-hidden rounded-lg">
                    <img
                      src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                      alt={movie.title}
                      className="w-full h-full object-cover rounded-lg transform transition duration-300 ease-in-out hover:scale-105"
                    />
                    </div>
                  </Link>
                </SwiperSlide>
              ))}
              <div
                ref={prevRef}
                className="swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              /> 
              <div
                ref={nextRef}
                className="swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
              />
            </Swiper>
          </div>
        ))}
      </div>
    </div>
  )
}
