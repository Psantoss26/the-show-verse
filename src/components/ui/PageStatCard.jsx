// Tarjeta de información de la cabecera de las páginas de usuario, con las
// MISMAS medidas que las de Favoritos (número text-xl y etiqueta de 9px en
// móvil, sin altura mínima): la ocupa su contenido.
export default function PageStatCard({ label, value, icon: Icon, colorClass = "text-white", loading = false }) {
  return (
    <div className="relative overflow-hidden w-full h-full lg:min-w-[120px] rounded-[2rem] bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-lg shadow-lg px-4 py-3 md:px-5 md:py-4 flex flex-col items-center justify-center gap-1">
      <div className={`relative z-10 mb-1 ${colorClass}`}>
        <Icon className="w-6 h-6 md:w-7 md:h-7" aria-hidden="true" />
      </div>
      <div className="relative z-10 text-xl md:text-2xl lg:text-3xl font-black text-white tracking-tight drop-shadow-md">
        {loading ? (
          <span className="block h-7 w-10 md:h-8 md:w-14 lg:h-9 rounded-lg bg-white/10 animate-pulse" />
        ) : (
          value
        )}
      </div>
      <div className="relative z-10 text-[9px] md:text-[10px] uppercase font-bold text-zinc-300 tracking-wider text-center leading-tight">
        {label}
      </div>
    </div>
  );
}
