# Escape Room — Santas Ochova (mercado negro de libros)

> **Nota (sep 2026)**: documento parcialmente LEGACY. Las fuentes de verdad actuales son `lore-santas-ochova.md` (trama/canon) y `hoja-de-ruta.md` (diseño/estructura/economía): donde este doc las contradiga, mandan ellas. Se conserva como referencia (§8 "3 ramas" y §13 "3 webs" ya superados; ver las notas "[Actualizado sep 2026]").

Documento de trabajo para diseñar el escape room narrativo + terminal web colaborativo.

---

## 1. Concepto general

- **Nombre ficticio de la librería**: **Santas Ochova** (completo: "Santas Ochova S.A., La Mejor Librería"; origen y canon del nombre en `lore-santas-ochova.md` §1).
- **Formato**: escape room colaborativo en papel + web-app (móvil, individual por jugadora), con varios programas en un mismo shell (`Computer.tsx`): tienda online, notas, fax, terminal y libro de juego (ver §3).
- **Jugadoras**: 6 fijas (roles ocultos) + 2 opcionales (Ángela, Macarena)
- **Duración objetivo**: 2-3 horas
- **Proporción físico/digital**: 50-50, honestamente
- **Tono**: (pendiente — ¿ligero/cómico o intriga seria tipo thriller?)
- **Lore base**: todas trabajan en la librería Santas Ochova, que en secreto busca, compra y vende libros prohibidos. Los datos de ese mercado negro están ocultos en la base de datos interna de la librería (el "terminal").
- **Precedente**: evolución del murder mystery ambientado en Bridgerton (sobres de personaje + timeline + debate grupal).

---

## 2. Personajes clave (nombres en clave)

Nombres alterados mínimamente respecto a personas reales, con cambio de sonido perceptible (no solo ortográfico), para mantener el guiño sin usar el nombre real.

| Nombre en clave | Nombre real (referencia) | Rol en la trama |
|---|---|---|
| **Mr. Higgins** | — | **Enemigo oculto / boss final**. Presumible responsable o cabeza del mercado negro de libros prohibidos. Su identidad/implicación se revela en la fase final. |
| **Jantolio** | Antonio | Personaje secundario / posible sospechoso (pendiente de definir rol exacto) |
| **Alena** | Alina | Personaje secundario / posible sospechosa (pendiente de definir rol exacto) |
| **Bellende** | Allende | Personaje secundario / posible sospechoso (pendiente de definir rol exacto) |

- [ ] Definir el rol exacto de Jantolio, Alena y Bellende dentro de la librería (¿son empleados, proveedores, clientes del mercado negro, contactos externos?)
- [ ] Definir cómo se relaciona cada uno con Mr. Higgins (¿cómplices, víctimas, sospechosos falsos/red herrings?)
- [ ] Decidir si alguno de ellos aparece solo mencionado en documentos/audios, o si tiene presencia directa en el juego

---

## 3. Los programas del Computer.tsx — [Actualizado sep 2026]

**[Actualizado sep 2026]** La vieja idea de "3 webs" queda sustituida por **un único shell (`Computer.tsx`) con
varios programas** que cada jugadora abre desde el móvil. Progreso compartido vía Supabase.

| Programa | Función | Contenido / estado |
|---|---|---|
| **Tienda online** | Escaparate puro, investigar/mirar | Catálogo, "sobre nosotros", easter eggs; sin interacción. Fácil de montar |
| **Notas** | Reconstruir la historia | Cada puzzle resuelto suelta 1 nota numerada; se descubren desordenadas; leídas en orden = la historia real |
| **Fax electrónico** | Chat con el Informante | Diálogo lineal con opciones tipo *Lifeline*. Por desarrollar |
| **Terminal** | Investigar: buscar, consultar, encontrar | Accesos por rol, modo admin, comandos ocultos. Importante para muchos puzzles |
| **Libro de juego** | Navegar y progresar | El minimapa + llaves + resolver puzzles (ver `hoja-de-ruta.md`) |

---

## 4. Las tres capas de información (soporte físico)

| Capa | Soporte | Visibilidad | Contenido |
|---|---|---|---|
| Documento compartido | Impreso, tipografía Courier, estilo "informe/expediente encontrado" | Público, todas lo leen a la vez | (pendiente de escribir) |
| Sobres por fase | Papel, uno por fase desbloqueada (ej. "Fase 3: audio + sobre «3»") | Se entregan progresivamente al desbloquear cada audio | Pistas físicas ligadas al audio correspondiente |
| Carpeta personal | Papel, una por jugadora | Privada (rol oculto, secretos, timeline) | Personalidad, historia, historia secreta, timeline de las últimas horas |

---

## 5. Sistema de fases: audio + sobre (gating físico-digital)

Patrón de bucle cerrado que alterna soporte en cada fase:

1. Resuelven un puzzle (web de la librería, terminal, o combinando pistas entre jugadoras).
2. La solución (ej. ISBN de 8 cifras) desbloquea el audio correspondiente en el Lobby.
3. El audio (voz del "contacto", generada con ElevenLabs) revela contenido narrativo + pista/contraseña para el siguiente sobre físico.
4. Abren el sobre de esa fase, que contiene material físico que alimenta el siguiente puzzle.
5. Vuelta al paso 1 para la siguiente fase.

### Tabla de fases (rellenar)

| Fase | Puzzle que desbloquea el audio | Contraseña/código | Qué revela el audio | Contenido del sobre físico |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | ej. ISBN oculto de 8 cifras | `________` | | Sobre «3» |
| 4 | | | | |
| 5 | | | | |

### Decisiones pendientes sobre el Lobby

- [ ] ¿Lobby con estado compartido (Supabase) o cada móvil desbloquea el suyo? → Recomendado: compartido, para que el desbloqueo sea visible para todas a la vez.
- [ ] ¿Los audios se escuchan individualmente (auriculares) o en conjunto (altavoz, momento grupal de suspense)?
- [ ] Formato de las contraseñas/códigos: ¿siempre numérico tipo ISBN, o variar el tipo de puzzle por fase?

---

## 6. Estructura narrativa del Terminal (3 capas de acceso)

1. **Capa 1 — Catálogo público**: lo que ve cualquier empleada por defecto. Aparentemente inocente.
2. **Capa 2 — Notas internas / pedidos especiales**: se desbloquea con credenciales o códigos encontrados en carpetas personales. Revela encargos "raros", clientes con sobrenombres o claves.
3. **Capa 3 — Modo admin / libro mayor oculto**: registro real de libros prohibidos, compradores, precios de mercado negro, posible rastro de Mr. Higgins. Se desbloquea **colectivamente** (bottleneck final).

---

## 7. Los 6 roles / personajes (jugadoras)

**[Actualizado sep 2026]** Son **6 jugadoras**; el reparto de roles canónico está en `lore-santas-ochova.md` §4 (2 empleadas normales, 1 con encargo, viajera B, infiltrada gubernamental, infiltrada revolucionaria). Rellenar por jugadora: nombre, puesto en la librería, personalidad, secreto/historia oculta, acceso especial en el terminal.

| # | Nombre | Puesto | Acceso especial | Secreto oculto |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |
| 4 | | | | |
| 5 | | | | |
| 6 | | | | |

**Ejemplo ya definido**: la nueva empleada empieza sin acceso al terminal (`contraseña_asignada: null`). Cuando el grupo desbloquea el modo admin, una jugadora con permisos puede asignarle una contraseña desde su propio terminal, y ella accede a contenido nuevo.

**Nota**: Jantolio, Alena y Bellende (sección 2) son personajes secundarios — podrían ser NPCs mencionados en documentos/audios, sospechosos externos, o vinculados a alguna de las 6 jugadoras (ej. familiar, pareja, contacto). Pendiente decidir su integración con la tabla de roles.

---

## 8. Estructura de puzzles (diseño en paralelo, no lineal)

> **[Actualizado sep 2026]** Lo de "3 ramas paralelas" queda **superado**. El paralelismo y lo colaborativo
> vienen de los **5 programas** (§3) + las 6 jugadoras trasteando a la vez, no de ramificar los puzzles: la ruta
> de puzzles del **Libro de juego** es guiada/casi lineal (ver `hoja-de-ruta.md`). El resto de esta sección
> (ramas A/B/C) queda como material histórico.

Regla de oro (histórica): con 6 jugadoras, evitar una cadena lineal de puzzles. Usar 3 ramas paralelas que confluyen en un bottleneck final.

### Rama A — (pendiente de nombrar, ej. Catálogo sospechoso)
- Jugadoras implicadas:
- Puzzle 1:
- Puzzle 2:
- Qué desbloquea al terminar:

### Rama B — (pendiente, ej. Notas de contabilidad)
- Jugadoras implicadas:
- Puzzle 1:
- Puzzle 2:
- Qué desbloquea al terminar:

### Rama C — (pendiente, ej. Correspondencia con clientes raros — posible aparición de Jantolio/Alena/Bellende)
- Jugadoras implicadas:
- Puzzle 1:
- Puzzle 2:
- Qué desbloquea al terminar:

### Bottleneck — Modo Admin
- Condición de desbloqueo (combinación de hallazgos de las 3 ramas):
- Qué pasa al desbloquearse (momento "wow" grupal):
- Duración estimada: 5–10 min

### Fase final
- Contenido de la Capa 3 (libro mayor oculto):
- Revelación final: **Mr. Higgins como enemigo oculto / cabeza del mercado negro**
- Consecuencias / cierre:

---

## 9. Timeline de la sesión (75–90 min)

| Fase | Duración | Qué ocurre |
|---|---|---|
| Apertura | 5–10 min | Reparto de carpetas personales + documento compartido, primer acceso al terminal individual |
| Investigación paralela | 30–40 min | 3 ramas simultáneas (A, B, C) + desbloqueo progresivo de audios/sobres |
| Bottleneck modo admin | 5–10 min | Convergencia de hallazgos, desbloqueo colectivo |
| Fase final | 15–20 min | Exploración capa oculta, último audio, revelación de Mr. Higgins |
| Cierre | 5 min | Consecuencias, cierre de la trama |

---

## 10. Mecánica de comandos ocultos en el Terminal

- **Comandos oficiales/documentados**: los que se explican o son obvios (`/help`, `/login`, `/catalogo`).
- **Comandos secretos por rol**: variantes descubribles solo con pistas de la carpeta personal (ej. `/help5` en vez de `/help`).
- **Comandos trampa / red herrings**: existen pero no llevan a nada relevante.
- **Comando maestro final**: requiere combinar fragmentos que tienen varias jugadoras distintas.

Lista de comandos a definir:

| Comando | Quién lo puede descubrir | Qué revela |
|---|---|---|
| | | |
| | | |

---

## 11. Easter eggs en la web ficticia de Santas Ochova

- [ ] Código fuente (comentarios HTML, consola del navegador)
- [ ] Enlace oculto en el footer o en una imagen
- [ ] Producto/libro del catálogo con nombre en clave
- [ ] Página 404 o ruta no listada con contenido oculto
- [ ] Metadatos de alguna imagen o archivo descargable
- [ ] Posible mención oculta a Mr. Higgins (ej. en créditos, "sobre nosotros", nombre de dominio de contacto)

---

## 12. Audios (ElevenLabs) — guion y producción

### 12.1 Etiquetado de voz (Eleven v3)

- Usar el modelo **Eleven v3** (no Multilingual v2) — es el único que interpreta tags de emoción/dirección entre corchetes.
- No existe un tag `[emphasis]` real. El énfasis se consigue con MAYÚSCULAS puntuales, signos de exclamación o puntos suspensivos, no con corchetes.
- Tags con buen soporte confirmado: `[whispers]`, `[rushed]`, `[pause]`, `[sighs]`, `[nervous]`, `[normal]`, `[slowly]`.
- Si un tag se lee en voz alta como palabra en lugar de aplicarse, es señal de tag poco común/no soportado — sustituir por uno de la lista anterior.

### 12.2 Guion Audio 1 — "El contacto" (borrador de prueba)

> [rushed] Vale, escuchadme, no tengo mucho tiempo.
>
> [whispers] Sé que trabajáis en la librería. Sé lo que habéis visto estos días. [pause] Y sé que ya sospecháis que algo no cuadra con los pedidos "especiales".
>
> [nervous] No puedo deciros quién soy. Todavía no. Pero necesito que confiéis en mí, porque si no actuáis rápido, otras personas van a llegar antes... [pause] y no os va a gustar lo que hagan cuando lleguen.
>
> [normal] Voy a daros algo que os va a ayudar a avanzar. Un número. Un ISBN que no existe en ningún catálogo oficial, [emphasized] pero que SÍ está en los registros internos de la trastienda.
>
> [slowly] Ocho... cifras... [pause] Buscadlo en las estanterías de abajo. No en el mostrador. [whispers] En la trastienda.
>
> [rushed] Tengo que colgar. No confiéis en nadie que os pregunte demasiado rápido por este mensaje. [pause] Y por favor... [sighs] daos prisa.

- Función narrativa: primer contacto anónimo, plantea la urgencia general y da el primer patrón de puzzle (ISBN de 8 cifras oculto en pista física).
- Pendiente: guiones de Audios 2–5, con posible aparición/mención de Mr. Higgins, Jantolio, Alena o Bellende.

### 12.3 Post-procesado: efecto "grabación clandestina / llamada interceptada"

El efecto de baja calidad/ruido **no se hace en ElevenLabs** (genera voz limpia por diseño) — se aplica después con FFmpeg.

Componentes del efecto:
- Filtro de banda telefónica (`highpass=300Hz` + `lowpass=3400Hz`): recorta graves/agudos, deja el rango de un teléfono analógico.
- Conversión a mono real (`pan=mono`).
- Capa de ruido blanco/rosa de fondo mezclada con la voz (`anoisesrc` + `amix`).
- Compresión de rango dinámico (`acompressor`) para sonar "aplastado".
- Opcional: reducción de bits (`acrusher`) para un deterioro más digital/agresivo — reservar para audios finales si se quiere transmitir que "la señal se pierde".

Script de referencia (`efecto_audio_ffmpeg.sh`) con 3 variantes:
- **Opción 1** (recomendada para Audio 1): filtro banda + ruido blanco suave + compresión. Efecto teléfono/radio clásico.
- **Opción 2**: añade `acrusher` (bitcrush) y ruido rosa más intenso — para audios más "dañados", ideal para tensión creciente hacia el final.
- **Opción 3**: solo filtro de banda, sin ruido — versión sutil si el ruido de las otras opciones sobra.

Requiere `ffmpeg` instalado (`brew install ffmpeg` en macOS). Aplicar al `.mp3` exportado de ElevenLabs antes de subirlo al Lobby.

- [ ] Decidir si todos los audios llevan el mismo nivel de "daño" o si se degrada progresivamente
- [ ] Probar Opción 1 con el guion del Audio 1 y ajustar amplitud de ruido al gusto

---

## 13. Arquitectura técnica

- **Las 3 webs**: proyectos separados (o rutas separadas dentro de un mismo proyecto Astro), todas desplegadas en **Vercel** (gratis, estático).
  - Web ficticia de Santas Ochova: contenido mayormente estático, easter eggs a mano.
  - Terminal/System: lógica de comandos, diálogos de opción múltiple, accesos por rol.
  - Lobby de audios: reproductor + validación de contraseñas por fase.
- **Estado compartido (multiplayer)**: Supabase (Postgres + Realtime), reutilizado por Terminal y Lobby.
  - Tabla `estado_global`: `modo_admin_desbloqueado`, `puzzles_grupales_resueltos`, `pistas_globales_reveladas`.
  - Tabla `jugadoras`: una fila por personaje — `nombre`, `password`, `fase_personaje`, `comandos_descubiertos_propios`.
  - Tabla `audios`: `numero_audio`, `desbloqueado (booleano)`, `contraseña_correcta`, `url_archivo_audio`.
- **Sincronización**: cada terminal/lobby se suscribe vía Supabase Realtime a cambios en las tablas relevantes; al actualizarse, todas las pantallas afectadas reaccionan sin recargar.
- **Audio**: guiones generados con ElevenLabs (modelo Eleven v3, tags de emoción), post-procesados con FFmpeg para efecto de baja calidad/interceptado, alojados como `.mp3` estáticos dentro del propio proyecto de Vercel.
- **Progreso individual de respaldo**: `localStorage` para continuar sesión si se cierra el navegador.
- **Mecánica de diálogo**: árbol de nodos (JSON) con texto + opciones múltiples, similar a un motor de ficción interactiva ligero.

---

## 14. Pendientes / decisiones abiertas

- [ ] Definir tono (cómico vs. thriller serio)
- [ ] Definir el rol exacto de Mr. Higgins, Jantolio, Alena y Bellende en la trama
- [ ] Escribir el documento compartido tipo "informe encontrado"
- [ ] Definir los 6 personajes (jugadoras) y sus secretos
- [ ] Diseñar las 3 ramas de investigación en detalle
- [ ] Escribir los diálogos del terminal (árbol de nodos)
- [ ] Definir lista completa de comandos ocultos
- [ ] Decidir quién(es) tienen "permisos admin" desde el inicio
- [ ] Escribir los guiones de los Audios 2–5 para ElevenLabs
- [ ] Definir puzzle/contraseña de cada fase de audio
- [ ] Diseñar el contenido de cada sobre físico por fase
- [ ] Diseñar la web ficticia de Santas Ochova y sus easter eggs
- [ ] Prototipar las tablas `estado_global`, `jugadoras` y `audios` en Supabase
- [ ] Probar el post-procesado FFmpeg sobre el Audio 1 y decidir variante final
- [ ] Diseñar la revelación final de Mr. Higgins como enemigo oculto
