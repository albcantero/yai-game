import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { execSync } from "node:child_process";

// SHA del commit para etiquetar los logs remotos (saber en que build corre cada sesion).
function buildSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "local";
  }
}

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  vite: {
    define: {
      __BUILD_SHA__: JSON.stringify(buildSha()),
    },
  },
});
