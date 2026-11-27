/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite levantar varios servidores a la vez (cada uno con su carpeta de compilación).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pg y PGlite se cargan como módulos de Node, sin empaquetar.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
  // El servidor lee en tiempo de ejecución el SQL del motor y los catálogos: en un despliegue
  // (p. ej. Vercel) hay que incluir esos archivos junto a las funciones. Los cortes AT03 no se
  // incluyen: se cargan desde Administración y viven en la base de datos.
  outputFileTracingIncludes: {
    "/**": [
      "./db/**",
      "./datos/Bancos_ficticios.csv",
      "./datos/Catalogo_CINU_SB109_reto.csv",
      "./datos/Tabla_SB21_simplificada.csv",
      "./datos/Diccionario_datos_AT03_reto.csv",
    ],
  },
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
