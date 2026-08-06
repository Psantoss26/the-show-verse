// Capas ópticas del cristal líquido (refracción del canto + reflejos).
//
// PUNTO INTERMEDIO, A PROPÓSITO.
// Con los valores fuertes el canto quedaba MARCADO: un aro claro recorriendo el
// borde de cada pieza que, en grupo, se leía como un contorno dibujado. Sin
// capas, en cambio, las piezas se veían planas. Estos valores buscan el término
// medio: hay relieve —se nota que es vidrio— pero el borde no se dibuja.
//
// LAS TRES DECISIONES QUE LO SOSTIENEN
//
// 1) BRILLO DEL CANTO = el del propio cristal (1.06, el mismo de
//    LIQUID_GLASS_BAR), no 1.16. Un canto MÁS claro que el centro es justo lo
//    que traza el contorno; igualándolo, el relieve lo aporta el desenfoque
//    extra y no una línea de luz. Esto es además lo que hace que funcione sobre
//    fondos CLAROS: con 1.16 el aro se quemaba a blanco sobre un cartel claro.
//
// 2) EL ARO EMPIEZA MUCHO MÁS AFUERA (62% en vez de 34%) y llega al máximo en el
//    borde. Antes cubría dos tercios de la pieza, así que el "canto" era casi
//    toda la superficie; ahora es una franja estrecha que se desvanece hacia
//    dentro, que es como se comporta el vidrio real.
//
// 3) REFLEJOS A LA MITAD. El especular de las esquinas y la luz superior siguen
//    ahí —son los que impiden que la pieza parezca plana— pero a la mitad de
//    intensidad, para que sobre un fondo claro no se conviertan en manchas
//    blancas.
//
// La saturación extra (160%) se mantiene porque es lo que da el color "líquido"
// del fondo atravesando el canto; era el 240% lo que lo volvía chillón.
export default function LiquidGlassOpticalLayers() {
  return (
    <>
      {/* Refracción del canto: mismo brillo que el cristal, más desenfoque. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] backdrop-blur-[2px] backdrop-brightness-[1.06] backdrop-saturate-[160%]"
        style={{
          WebkitMaskImage:
            "radial-gradient(112% 128% at 50% 50%, transparent 62%, #000 100%)",
          maskImage:
            "radial-gradient(115% 135% at 50% 50%, transparent 66%, #000 100%)",
        }}
      />
      {/* Especular de las esquinas (relieve, sin trazar línea). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[linear-gradient(125deg,rgba(255,255,255,0.06)_0%,rgba(255,255,255,0.02)_16%,transparent_40%,transparent_60%,rgba(255,255,255,0.02)_86%,rgba(255,255,255,0.04)_100%)]"
      />
      {/* Luz superior, que da el volumen. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] bg-[radial-gradient(130%_100%_at_50%_0%,rgba(255,255,255,0.05)_0%,transparent_68%)]"
      />
    </>
  );
}
