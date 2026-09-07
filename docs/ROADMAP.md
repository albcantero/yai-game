# Roadmap — Santas Ochova (escape room)

Estado y tareas de desarrollo. Marca `[x]` lo hecho. Docs de referencia: `lore-santas-ochova.md` (trama) y `escape-room-libreria.md` (mecánica/arquitectura).

Objetivo: escape room de **6 jugadoras**, ~2-3 h, físico + digital, **sin máster** (100% autónomo), para el cumple de Yaiza.

## Fase 1 — App: Terminal (casi hecha)
- [x] Terminal base (CRT, teclado propio, comandos, boot)
- [x] Login por personaje (RPC propio contra `credentials`) + panel de cuenta
- [x] Chat "Mis mensajes": roster (Sala común + DMs) + hilo + envío + realtime
- [ ] Presencia (quién está conectada)
- [ ] Marca de "no leído" en el roster
- [ ] Limpiar antes de la fiesta: `SHOW_BUILD`, `?debug=1`, tabla `debug_logs`

## Fase 1.5 — Esqueleto de diseño (ANTES del lobby)
- [ ] Los 6 roles con sus habilidades asimétricas (admin gubernamental, hack revolucionaria, ventaja de info de B)
- [ ] Nº de fases/tramos del juego
- [ ] Arquitectura de información: 3 esferas (global / por estación / privada) = niebla de guerra
- [ ] Mapear los 4 latidos (quién/dónde está Higgins + libros prohibidos + viajes) a descubrimientos físicos/digitales
- [ ] Diseño de autonomía: qué pasa si se atascan o van en otro orden (pistas de rescate, gating que perdona)

## Fase 2 — Web ficticia de la librería (rápida)
- [ ] Shell estático (catálogo público, "sobre nosotros", etc.)
- [ ] Easter eggs y pistas ocultas (el contenido concreto es de la fase 4)

## Fase 3 — Lobby + motor de chat con el informante (Lifeline)
- [ ] Lobby grupal (cuaderno de notas + micromapa)
- [ ] Motor de árbol de diálogo tipo Lifeline (JSON/TS, sin BD)
- [ ] DMs 1-a-1 con privacidad (ya montado en el terminal, revisar RLS)
- [ ] → **v1 de la app terminada**

## Fase 3.5 — Vertical slice (probar el bucle entero pronto)
- [ ] Montar UNA fase completa: app + 1 audio + 1 puzzle + 1 prueba física (aunque sea cutre)
- [ ] Probarla con gente **sin que Alberto intervenga** (test de autonomía)
- [ ] Corregir la arquitectura según lo que falle (aún es barato)

## Fase 4 — Primera capa de lore
- [ ] Crear fases/rooms
- [ ] Grabar audios (ElevenLabs)
- [ ] Primeros puzzles, cotejando con la app y corrigiéndola sobre la marcha

## Fase 5 — Completar la línea principal
- [ ] Todas las conversaciones (árbol del informante completo)
- [ ] Todos los puzzles y salas
- [ ] Todos los audios

## Fase 6 — Producción física (Canva) · intercalar con 4-5, no todo al final
- [ ] Diseñar e imprimir pruebas físicas, puzzles y props
- [ ] Falsificaciones Photoshop: carta del s. XVI, portada/colofón de 1976 con "Ruby Cadler"
- [ ] Nota manuscrita "VUELVE AL 4 DE AGOSTO DE 1956" en el ejemplar real de 1975
- [ ] Formar sobres / cajas por fase

## Fase 7 — Playtesting
- [ ] Varias pruebas completas
- [ ] Al menos una **sin que Alberto reconduzca** (el juego se dirige solo)
- [ ] Ajustar tiempos, dificultad y puntos de atasco

## Decisiones clave aún abiertas (ver `lore-santas-ochova.md`)
- [ ] Cerrar Hueco 3: encuentro A/B en 2026 y motivo del viaje de B desde 2056
- [ ] Nombres/personalidad de las 6 jugadoras + de las 2 amigas de Ruby
- [ ] Qué es exactamente "todo" en el voto final (filtrar vs borrar)
- [ ] Poda de jugabilidad: qué lore SÍ llega a la mesa y qué se queda de fondo
