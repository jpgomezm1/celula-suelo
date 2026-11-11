import type { NextConfig } from "next";

const config: NextConfig = {
  experimental: {
    // Las exportaciones/estudios de Galería con imágenes pesan ~30 MB; el proxy de acceso las bufferiza.
    proxyClientMaxBodySize: "60mb",
  },
};

export default config;
