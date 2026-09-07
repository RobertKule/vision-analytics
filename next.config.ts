import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Supprime le header "X-Powered-By: Next.js" pour ne pas exposer la stack technique
  poweredByHeader: false,

  // Active le mode strict React pour détecter les effets de bord au développement
  reactStrictMode: true,

  // Autorise le chargement d'images depuis Cloudinary (utilisées dans les galeries d'inspection)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },

  // Configuration des Server Actions : limite de corps augmentée pour les soumissions d'observations
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
