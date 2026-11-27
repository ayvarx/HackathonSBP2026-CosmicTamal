/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite levantar varios servidores a la vez (cada uno con su carpeta de compilación).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pg y PGlite se cargan como módulos de Node, sin empaquetar.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  experimental: {
    // proxy.js hace que Next guarde en memoria cada cuerpo de solicitud (10 MB por defecto).
    // Un corte AT03 pesa ~11 MB sin comprimir: se sube el límite para que también llegue
    // completo sin gzip (p. ej. con curl). La ruta de carga rechaza archivos de más de 60 MB.
    proxyClientMaxBodySize: "64mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
