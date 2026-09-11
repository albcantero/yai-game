// Reset de la partida a punto 0. Usa la SERVICE_ROLE key (solo local, en .env) -> se salta la RLS.
//   npm run reset          -> 0 llaves (punto 0 real)
//   npm run reset -- 99    -> 99 llaves (para testear puertas en vivo)
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// carga .env (mini-parser, sin dependencias ni requisitos de versión de Node)
function loadEnv(path = ".env") {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* sin .env: se usa el entorno del sistema */ }
}
loadEnv();

const url = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE;
if (!url || !key) {
  console.error("Falta PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE en .env (ver .env.example)");
  process.exit(1);
}

const keys = Number.parseInt(process.argv[2] ?? "0", 10) || 0;
const supabase = createClient(url, key, { auth: { persistSession: false } });
const { error } = await supabase.rpc("reset_game", { p_keys: keys });
if (error) { console.error("Reset FALLÓ:", error.message); process.exit(1); }
console.log(`Partida reseteada a punto 0 (keys=${keys}; chat y logs borrados).`);
