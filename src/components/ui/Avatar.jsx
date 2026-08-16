"use client";

import { useState } from "react";
import OptimizedImage from "@/components/OptimizedImage";

// Inicial de respaldo de una foto de perfil: la primera letra del primer valor
// con contenido (nombre visible antes que usuario), en mayúscula. Se recorre en
// cascada para que un perfil sin nombre siga mostrando algo reconocible.
// `Array.from` en vez de `charAt` para no partir por la mitad un emoji o una
// letra fuera del plano básico.
export function getInitial(...sources) {
  for (const source of sources) {
    const first = Array.from(String(source ?? "").trim())[0];
    if (first) return first.toUpperCase();
  }
  return "?";
}

// CONTENIDO de un avatar, no su marco: pinta la imagen o, si no hay, la inicial.
// El contenedor (tamaño, forma, fondo, color de texto) lo pone quien lo usa,
// porque cada sitio tiene el suyo —círculo en la barra, cuadrado redondeado en
// ajustes— y así este componente encaja en todos sin heredar estilos ajenos.
export default function Avatar({
  src,
  name,
  alt,
  className = "h-full w-full object-cover",
  fallbackClassName = "",
  ...imageProps
}) {
  // Una URL guardada puede dejar de servir (host caído, archivo borrado, enlace
  // mal pegado). Sin esto el navegador pintaría el icono de imagen rota en vez
  // de la inicial, que es justo el caso que el respaldo debe cubrir.
  const [brokenSrc, setBrokenSrc] = useState(null);

  if (!src || brokenSrc === src) {
    return (
      <span aria-hidden="true" className={fallbackClassName || undefined}>
        {getInitial(name)}
      </span>
    );
  }

  return (
    <OptimizedImage
      src={src}
      alt={alt ?? name ?? ""}
      className={className}
      onError={() => setBrokenSrc(src)}
      {...imageProps}
    />
  );
}
