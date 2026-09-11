// Normaliza los SONIDOS de efecto (SFX) con ffmpeg: recorta silencios de inicio/fin (para que suenen al
// instante) y nivela el loudness a -16 LUFS (EBU R128), de forma que TODOS queden al mismo nivel.
//
// NO toca los bucles/música/ambiente (recortar silencios rompería el loop) ni el arranque largo: van en EXCLUDE.
// Requiere ffmpeg en el PATH.
//
//   npm run audio:normalize                 -> normaliza todos los SFX (menos los excluidos)
//   npm run audio:normalize -- tick.mp3      -> normaliza SOLO los ficheros indicados (aunque estén excluidos)
//
// Nota: como todos los ficheros quedan al mismo loudness, los volúmenes por-sonido de playSfx (0.5, 0.6...)
// pasan a ser atenuaciones relativas uniformes; repasa por oído los que se descuadren tras normalizar.
import { readdirSync, renameSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const DIR = "public/audio";
// bucles/música/ambiente (recortar silencios rompe el loop) + arranque largo: NO se normalizan
const EXCLUDE = new Set(["main-menu-loop-music.mp3", "terminal-humming.mp3", "terminal-turning-on.mp3"]);

// recorta silencio final (areverse -> silenceremove -> areverse) + inicio, y nivela loudness a -16 LUFS
const FILTER =
  "areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse," +
  "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-1.5:LRA=11";

const args = process.argv.slice(2).map((a) => a.replace(/^.*[\\/]/, "")); // acepta nombres o rutas
const files = (args.length ? args : readdirSync(DIR).filter((f) => f.endsWith(".mp3")))
  .filter((f) => args.length > 0 || !EXCLUDE.has(f)); // con args explícitos, no se excluye nada

if (!files.length) { console.log("No hay ficheros que normalizar."); process.exit(0); }

let ok = 0;
for (const f of files) {
  const src = join(DIR, f);
  const tmp = join(DIR, f.replace(/\.mp3$/, ".norm.mp3"));
  try {
    execFileSync("ffmpeg", ["-y", "-i", src, "-af", FILTER, "-ar", "44100", tmp], { stdio: "ignore" });
    renameSync(tmp, src);
    console.log(`OK    ${f}  (${statSync(src).size} bytes)`);
    ok++;
  } catch (e) {
    console.error(`FALLO ${f}: ${e instanceof Error ? e.message : e}`);
  }
}
console.log(`\nNormalizados ${ok}/${files.length}. Excluidos (bucles/música/arranque): ${[...EXCLUDE].join(", ")}.`);
console.log("Revisa por oído los volúmenes de playSfx que se descuadren.");
