import { defineConfig, globalIgnores } from "eslint/config";
import eslintPluginAstro from "eslint-plugin-astro";
import tseslint from "typescript-eslint";

export default defineConfig([
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs["flat/recommended"],
  // Saída do build do Astro e da Cloudflare.
  globalIgnores(["dist/**", ".astro/**", ".wrangler/**"]),
]);
