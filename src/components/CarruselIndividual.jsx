'use client'

import { useRef, useEffect } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Navigation } from 'swiper'
import 'swiper/swiper-bundle.css'
import Link from 'next/link'

export default function CarruselIndividual({ movies = [], title = '', type = 'movie' }) {
  const prevRef = useRef(null)
  const nextRef = useRef(null)

  return (
    <div className="relative group">
      <h3 className="text-4xl font-[730] inline-block text-primary-text mb-4">
        <span className="bg-gradient-to-b from-blue-600 via-blue-400 to-white bg-clip-text text-transparent tracking-widest uppercase">
          {title}
        </span>
      </h3>

      <Swiper
        spaceBetween={20}
        slidesPerView={10}
        modules={[Navigation]}
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
        className="group relative"
        breakpoints={{
          640: { slidesPerView: 2 },
          768: { slidesPerView: 4 },
          1024: { slidesPerView: 10 }
        }}
      >
        {movies.map((movie) => (
          <SwiperSlide key={movie.id}>
            <Link href={`/details/${type}/${movie.id}`}>
              <div className="cursor-pointer">
                <img
                  src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`}
                  alt={movie.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            </Link>
          </SwiperSlide>
        ))}
      </Swiper>

      <div
        ref={prevRef}
        className="swiper-button-prev !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />
      <div
        ref={nextRef}
        className="swiper-button-next !text-white !w-8 !h-8 !flex !items-center !justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300"
      />
    </div>
  )
}
