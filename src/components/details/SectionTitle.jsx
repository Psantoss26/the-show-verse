"use client";

// /src/components/details/SectionTitle.jsx
// Encabezado de sección de la ficha: icono en su cajita, título y la línea que
// se ilumina al pasar por encima de la sección (`group/section`).
//
// Extraído de DetailsClient para que la ficha de TELÉFONO del DetailModal use
// EXACTAMENTE el mismo encabezado en vez de una imitación que se separaría al
// primer retoque.

export default function SectionTitle({ title, icon: Icon, className = "" }) {
  return (
    <div
      className={`flex items-center gap-3 sm:gap-4 mb-8 w-full ${className}`}
    >
      {Icon && (
        <div className="relative flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 rounded-[14px] bg-yellow-500/5 backdrop-blur-2xl shadow-[0_4px_24px_rgba(234,179,8,0.12)] shrink-0 overflow-hidden group-hover/section:bg-yellow-500/10 group-hover/section:shadow-[0_8px_32px_rgba(234,179,8,0.2)] transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/20 via-transparent to-transparent opacity-60" />
          <div className="absolute inset-0 shadow-[inset_0_1px_2px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.2)] rounded-[14px] pointer-events-none" />
          <Icon className="relative z-10 w-5 h-5 sm:w-6 sm:h-6 text-yellow-500 group-hover/section:text-yellow-400 group-hover/section:scale-110 transition-all duration-500 drop-shadow-[0_2px_8px_rgba(234,179,8,0.4)]" />
        </div>
      )}
      <h2 className="text-2xl sm:text-[28px] font-black tracking-tight text-white drop-shadow-md shrink-0">
        {title}
      </h2>
      <div className="ml-2 sm:ml-4 flex-1 h-px bg-gradient-to-r from-white/20 via-white/5 to-transparent relative flex items-center">
        <div className="absolute left-0 w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_12px_rgba(234,179,8,1)] opacity-40 group-hover/section:opacity-100 group-hover/section:scale-150 transition-all duration-500" />
        <div className="absolute left-0 w-16 sm:w-24 h-[2px] bg-gradient-to-r from-yellow-500 to-transparent opacity-0 group-hover/section:opacity-100 transition-opacity duration-500" />
      </div>
    </div>
  );
}
