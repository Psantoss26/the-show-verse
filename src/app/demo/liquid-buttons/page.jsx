"use client";

import { useState } from "react";
import LiquidButton from "@/components/LiquidButton";
import { Heart, Star, Bookmark, Play, Share2 } from "lucide-react";

export default function LiquidButtonsDemo() {
  const [states, setStates] = useState({
    favorite: false,
    star: false,
    bookmark: false,
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-8">
      <div className="max-w-4xl mx-auto space-y-12">
        {/* Header */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
            Liquid Buttons Demo
          </h1>
          <p className="text-xl text-gray-400">
            Pasa el cursor sobre los botones y observa el efecto líquido
          </p>
        </div>

        {/* Demo Interactive */}
        <section className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold mb-6">Botones Interactivos</h2>
          <div className="flex flex-wrap gap-4 justify-center">
            <LiquidButton
              activeColor="red"
              active={states.favorite}
              onClick={() =>
                setStates((s) => ({ ...s, favorite: !s.favorite }))
              }
              title="Favorito"
            >
              <Heart
                className={`w-5 h-5 ${states.favorite ? "fill-current" : ""}`}
              />
            </LiquidButton>

            <LiquidButton
              activeColor="yellow"
              active={states.star}
              onClick={() => setStates((s) => ({ ...s, star: !s.star }))}
              title="Destacado"
            >
              <Star
                className={`w-5 h-5 ${states.star ? "fill-current" : ""}`}
              />
            </LiquidButton>

            <LiquidButton
              activeColor="blue"
              active={states.bookmark}
              onClick={() =>
                setStates((s) => ({ ...s, bookmark: !s.bookmark }))
              }
              title="Guardar"
            >
              <Bookmark
                className={`w-5 h-5 ${states.bookmark ? "fill-current" : ""}`}
              />
            </LiquidButton>

            <LiquidButton activeColor="green" title="Reproducir">
              <Play className="w-5 h-5 fill-current" />
            </LiquidButton>

            <LiquidButton activeColor="purple" title="Compartir">
              <Share2 className="w-5 h-5" />
            </LiquidButton>
          </div>
        </section>

        {/* Colors */}
        <section className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
          <h2 className="text-2xl font-bold mb-6">Colores Disponibles</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {["blue", "red", "yellow", "purple", "green"].map((color) => (
              <div key={color} className="flex flex-col items-center gap-3">
                <span className="text-sm font-medium uppercase text-gray-400">
                  {color}
                </span>
                <LiquidButton activeColor={color} active={true}>
                  <Heart className="w-5 h-5 fill-current" />
                </LiquidButton>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="grid md:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-sm rounded-xl p-6 border border-blue-500/20">
            <h3 className="text-xl font-bold mb-2 text-blue-300">
              🌊 Efecto Líquido
            </h3>
            <p className="text-gray-300">
              Ondulaciones que se propagan como gotas de agua
            </p>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-xl font-bold mb-2 text-purple-300">
              ✨ Partículas
            </h3>
            <p className="text-gray-300">
              Partículas flotantes con movimiento orgánico
            </p>
          </div>

          <div className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 backdrop-blur-sm rounded-xl p-6 border border-yellow-500/20">
            <h3 className="text-xl font-bold mb-2 text-yellow-300">
              🔗 Propagación
            </h3>
            <p className="text-gray-300">
              Los efectos se propagan a botones cercanos
            </p>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 backdrop-blur-sm rounded-xl p-6 border border-green-500/20">
            <h3 className="text-xl font-bold mb-2 text-green-300">
              💎 Cristal
            </h3>
            <p className="text-gray-300">
              Brillos dinámicos tipo cristal líquido
            </p>
          </div>
        </section>

        {/* Info */}
        <div className="text-center text-gray-500 pt-8 border-t border-white/10">
          <p>
            Las animaciones solo se ejecutan en hover/active para optimizar
            rendimiento
          </p>
        </div>
      </div>
    </div>
  );
}
