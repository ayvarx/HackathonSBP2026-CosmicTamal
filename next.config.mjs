/** @type {import('next').NextConfig} */
const nextConfig = {
  // Permite levantar varios servidores a la vez (cada uno con su carpeta de compilación).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pg y PGlite se cargan como módulos de Node, sin empaquetar.
  serverExternalPackages: ["pg", "@electric-sql/pglite"],
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
