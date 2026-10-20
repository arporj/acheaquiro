// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import { cacheCloudflare } from "@astrojs/cloudflare/cache";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // Sem otimização de imagens por enquanto: evita o binding de Images.
    imageService: "passthrough",
  }),
  // Sem sessões do Astro: evita criar um armazenamento KV na conta. O login
  // (etapa 2) usa o Supabase Auth.
  session: false,
  // Cache das páginas públicas na Cloudflare: cada página liga o seu
  // (src/lib/cache.ts). Sem routeRules: a regra de "/[categoria]" também
  // valeria para a página 404.
  cache: { provider: cacheCloudflare() },
  // As fontes são baixadas no build e servidas pelo próprio site: o navegador
  // do visitante não faz nenhuma requisição ao Google.
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Baloo 2",
      cssVariable: "--font-baloo",
      weights: [600, 700, 800],
      subsets: ["latin"],
    },
    {
      provider: fontProviders.google(),
      name: "Nunito",
      cssVariable: "--font-nunito",
      weights: [400, 600, 700, 800],
      subsets: ["latin"],
    },
  ],
  // O atalho "@/" vem dos paths do tsconfig.json, que o Astro já lê.
  vite: {
    plugins: [tailwindcss()],
  },
});
