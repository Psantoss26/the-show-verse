import type { NextConfig } from "next";
import dns from "dns";

// 1. FORZAR IPV4
// Esto soluciona el error "ConnectTimeoutError" / "UND_ERR_CONNECT_TIMEOUT"
// obligando a Node.js a usar direcciones IPv4 en lugar de IPv6.
if ("setDefaultResultOrder" in dns) {
  dns.setDefaultResultOrder("ipv4first");
}

const nextConfig: NextConfig = {
  /* config options here */

  // 2. DOMINIOS DE IMÁGENES PERMITIDOS
  // Necesario para que el componente <Image> de Next.js cargue fotos de TMDb
  images: {
    domains: [
      "image.tmdb.org",
      "themoviedb.org",
      "googleusercontent.com"
    ],
  },
};

export default nextConfig;