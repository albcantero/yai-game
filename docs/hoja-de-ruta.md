# Hoja de ruta: "EL libro PERDIDO" (Santas Ochova)

> Fuente de verdad del DISEÑO. Topología, costes y rutas en `src/components/screens/Minimap.tsx`
> (`ROOMS` / `LINKS` / `ROUTES`). El contenido de los puzzles se diseña aquí antes de implementarse.

## 1. Premisa y meta

- **Premisa**: librería de mercado negro de libros "Santas Ochova". 6 jugadoras buscan el libro perdido.
- **Meta / final**: llegar a **La Cámara** (hab. 10), la cámara oculta de Santas Ochova, y hallar allí ***La
  jauría humana*** (ed. 1975, con "Hawes") y la verdad sobre Higgins y Ruby. La **Llave Maestra** del puzzle final
  abre la **salida de la Librería** y dispara el **voto grupal** (§ final). Salir no es "ganar": abre la decisión moral.
- **Llaves**: fungibles genéricas. Resolver un puzzle = +1 llave; cruzar una puerta cerrada cuesta llaves.
- **Ruta única**: aunque el mapa tiene dos ramas (norte/sur), la ruta EFECTIVA es **una sola**, forzada por las
  **dependencias de los puzzles** (§3), no por las puertas. Te puedes mover libre si tienes llaves, pero solo
  *progresas* (resolver, conseguir items) en un orden.
- **El minimapa es UN programa** dentro de `Computer.tsx` (con la terminal, la tienda online, el chat, más los
  documentos físicos de la mesa). La ruta de puzzles es guiada, pero la partida NO es lineal: las 6 jugadoras
  trastean a la vez distintas superficies. El paralelismo y lo colaborativo vienen de ahí, no de ramificar los
  puzzles. (Sustituye a la idea vieja de "3 ramas paralelas" de `escape-room-libreria.md` §8.)

## 2. Dos capas (clave del diseño)

- **Puertas = candados por LLAVE genérica.** Marcan el ritmo y el traslado. **Ya implementado.**
- **Puzzles = estilo Blue Prince (deducción / información), NO aritmética.** Un puzzle puede necesitar un
  **ITEM** o una **INFO** de OTRA sala para poder entenderse o resolverse. Esta capa es la que fuerza la ruta
  única. **Mecánica NUEVA** (inventario + flags + prerrequisitos de puzzle + puertas por item/código); pendiente.

## 3. Salas y la cadena de dependencias (ruta única)

| Nº | Sala | id | Puzzles | Ruta | Notas |
|----|------|----|---------|------|-------|
| 1 | Librería | `libreria` | 1 | tronco/salida | entrada; puerta de salida final |
| 2 | Almacén de tienda | `hub-almacen` | 1 | tronco | inicio |
| 3 | Depósito | `r4` | (1)\* | norte | da lo necesario para abrir el Despacho |
| 4 | Sótano | `r5` | (1)\* | norte | callejón; su puerta cuesta ~5-6 llaves (el muro); da la Tarjeta de seguridad del Almacén |
| 5 | Biblioteca privada | `r3` | (1)\* | norte | toca el Proyecto (conector) |
| 6 | Proyecto de sala de lectura | `r2` | 3 | sur | central, nudo |
| 7 | Sala de Máquinas | `r1` | 2 | sur | calderas, plomos |
| 8 | Despacho | `r6` | código | sur | carta + código físicos → golpe de llaves de una vez (de 1-3 a 5-6, para el Sótano) |
| 9 | Antesala | `r7` | (1)\* | sur | se pasa con la info de la Librería; rol concreto por definir |
| 10 | La Cámara | `r8` | (1)\* | sur | callejón; el libro + la Llave Maestra; en descripción se llama "Scriptorium" |

\* Provisional: puzzle de +1 llave por sala (a re-ajustar con el script, ver §4).

**Recorrido forzado** (orden en que se puede *progresar*):

1. **Almacén** (inicio).
2. **NORTE**: Almacén → Intersección → **Biblioteca privada** y **Depósito**. El **Depósito** da lo necesario para abrir el Despacho.
3. **SUR**: Almacén → Sala de Máquinas → **Proyecto de sala de lectura** → **Despacho** (se abre con lo del
   Depósito). Dentro, una **carta física** dice que el personal de limpieza pierde las llaves y guarda repuestos;
   un sobre trae un **código** que, al introducirlo, suelta un **golpe de llaves de una vez** (mirando en el
   cajón, sin puzzle) que sube el saldo normal (1-3) a las **~5-6** que cuesta abrir el **Sótano**.
4. **Backtrack al Sótano** (norte), ya con 5 llaves. Da el **ITEM "Tarjeta de seguridad del Almacén"**.
5. **Librería** (se abre con la Tarjeta). Da la **INFO** para pasar de la **Antesala** a **La Cámara**.
6. **Antesala → La Cámara** (Antesala: rol concreto por definir). Puzzle final → **ITEM "Llave Maestra"**.
7. Vuelta a la **Librería** → la Llave Maestra abre la **SALIDA** → se dispara el **voto grupal** (publicar todo / callar), con sus implicaciones sobre Higgins. Ahí acaba el juego.

Sin bucles: Depósito →(abre)→ Despacho →(+llaves → 5)→ Sótano →(Tarjeta)→ Librería →(info)→ Antesala → La Cámara →(Llave Maestra)→ Salida.

### Diagrama

Líneas continuas = corredores físicos del mapa; punteadas = **cadena de dependencias** (qué desbloquea qué), numeradas 1-5.

```mermaid
flowchart TD
    A([Almacén de tienda])

    subgraph NORTE
        INT{{Intersección}}
        BIB[Biblioteca privada]
        DEP[Depósito]
        SOT[Sótano]
        INT --> BIB
        INT --> DEP
        DEP --> SOT
    end

    subgraph SUR
        MAQ[Sala de Máquinas]
        PROY[Proyecto de sala de lectura]
        DESP[Despacho]
        ANT[Antesala]
        CAM[La Cámara]
        MAQ --> PROY
        PROY --> DESP
        DESP --> ANT
        ANT --> CAM
    end

    A --> INT
    A --> MAQ
    A --> LIB[Librería]
    BIB -.->|conector| PROY

    DEP -.->|1. abre| DESP
    DESP -.->|2. cajón: golpe de llaves → 5-6| SOT
    SOT -.->|3. Tarjeta de seguridad| LIB
    LIB -.->|4. INFO| ANT
    CAM -.->|5. Llave Maestra| SAL([Salir de la Librería → voto grupal])
```

## 4. Economía de llaves (traslado)

**Modelo (propuesta de Alberto, sep 2026)**: acumulas llaves en la 1ª mitad pero **NO llegas a las 5 del muro del
Sótano por tu cuenta**: llegas a **~4/5** (los candados de 2 llaves + los puzzles que dan llave pero están
**info-bloqueados** te mantienen corto). El **cajón del Despacho** da el golpe que te lleva de 4/5 a 5+: el cajón
**es NECESARIO** para romper el muro.

- **Landing objetivo**: llegar al Sótano con **~4/5** llaves; el cajón (~+1-2) lo remata a 5+.
- **Lo que te mantiene corto**: los candados de **2 llaves** (Proyecto→Despacho, Máquinas→Proyecto) + que varios
  puzzles que dan llave (los 3 del **Depósito**, ≥1 del Proyecto) estén **info-bloqueados** hasta *después* del
  Sótano (se resuelven al volver, backtracking). Si se resolvieran antes, te pasarías de 5 y el cajón sobraría.
- **Riesgo (a verificar con el script)**: que llegues con lo justo para que el cajón remate (ni de más ni de
  menos) y que no haya deadlock de info. Es el mapa de info lo que hay que clavar.

### Números cableados (sep 2026)

**Puzzles por sala (21 en total, Puzzle 1..21):**

| Sala | Puzzles | Nº | Info que necesita |
|---|---|---|---|
| Almacén de tienda | 1 | 1 | : |
| Biblioteca privada | 2 | 2-3 | : |
| Depósito | 3 | 4-6 | **info de la Librería** (se resuelven en el backtracking) |
| Proyecto de sala de lectura | 4 | 7-10 | ≥1: info de otra sala |
| Sala de Máquinas | 2 | 11-12 | : |
| Despacho | 2 | 13-14 | uno necesita **info del Sótano** (revela la puerta secreta a la Antesala) |
| Sótano | 1 | 15 | da la **Tarjeta** + info para el Despacho |
| Librería | 3 | 16-18 | da la **info** de los puzzles bloqueados de otras salas |
| Antesala | 2 | 19-20 | uno necesita **info de la Librería** |
| La Cámara | 1 | 21 | **info de la Librería**; da la **Copia de la Llave Maestra** |

**Puertas (precios cableados)**: Almacén→Biblioteca 1 · Almacén→Máquinas 1 · Biblioteca→Depósito 1 ·
Biblioteca→Proyecto 1 · Proyecto→Despacho 2 · Máquinas→Proyecto 2 · Depósito→**Sótano 5** (muro) ·
**Despacho→Antesala 1** (SECRETA: se revela al resolver el último puzzle del Despacho) · **Antesala→Cámara 2** ·
Almacén→Librería por **ITEM Tarjeta** (placeholder 1 llave en código).

**Candado FINAL (idea de Alberto)**: entre la Librería y el FIN, coste = **llaves libres** = (Σ todas las llaves −
Σ todos los candados). Fuerza a resolver TODOS los puzzles antes de acabar. Hoy: Σ llaves = 21, Σ candados ≈ 16 →
**≈ 5**. Recomendación: calcularlo sobre la **suma de TODOS los candados** (no los "abiertos"), así no depende del
camino ni deja soft-lock por las puertas redundantes (las dos vías a Máquinas). Además pide la **Copia de la Llave Maestra** (item de La Cámara).

**Cajón (a confirmar)**: con estos números llegas al Sótano con **~3** (el Depósito está bloqueado por info de la
Librería, que es posterior) y el muro es 5 → faltan **~2**: el **cajón sigue siendo necesario**. ¿+2 en un puzzle
del Despacho, o pieza aparte "código → +2"?

**Pendiente**: fijar el **mapa de info** completo y verificar con el checker (sin deadlock; que aterrizas en ~4/5
para que el cajón remate; que el candado final fuerza el 100%).

## 5. Slots de puzzle (contrato: REQUIERE → DA)

**Items especiales (solo 2):**

- **Tarjeta de seguridad del Almacén**: abre la puerta Almacén → Librería. Se consigue en el **Sótano**.
- **Llave Maestra**: abre la **salida final** (fin del juego). Se consigue en **La Cámara**.

El detalle pieza a pieza (físico, enunciado "Leer", panel "Descripción", solución OTP, sobre, nota, dependencia)
vive en **`puzzles.md`**. Aquí solo el resumen de dependencias:

| Sala | Requiere (para resolverse) | Da (al resolverse) |
|------|----------------------------|--------------------|
| Almacén de tienda | : | +1 llave |
| Sala de Máquinas | : | +2 llaves |
| Proyecto de sala de lectura | : | +3 llaves |
| Biblioteca privada | : | +1 llave |
| Depósito | : | +1 llave + lo necesario para **abrir el Despacho** |
| Despacho | lo del Depósito (para abrir) | **código físico → golpe de llaves de una vez** (de 1-3 a 5-6, sin puzzle); abre el **Sótano** |
| Sótano | 5-6 llaves | +1 llave + **ITEM "Tarjeta de seguridad del Almacén"** |
| Librería | **ITEM "Tarjeta de seguridad del Almacén"** | +1 llave + **INFO para la Antesala / La Cámara** |
| Antesala | **INFO de la Librería** | +1 llave (rol concreto por definir) |
| La Cámara | pasar la Antesala | +1 llave + ***La jauría humana* (1975)** + la verdad de Higgins/Ruby + **ITEM "Llave Maestra"** |
| Salida (Librería) | **Llave Maestra** | se sale de la librería → **voto grupal** (publicar / callar) → fin |

## 6. Orden de desarrollo

1. **Historia + meta** ✅
2. **Estructura: grafo + rutas + economía** ✅ (rutas cableadas; falta re-balancear y el script)
3. **Contratos de puzzle** ✅ (esta tabla; dependencias definidas)
4. **Contenido** de cada puzzle (Blue Prince) ← en marcha (empezado por el Despacho)
5. **Piel física/digital** (props); se derivan del contenido
6. **Montar + cablear + playtestear**

## 7. Pendientes

- [ ] Implementar la mecánica de la capa 2: inventario + flags + prerrequisitos de puzzle + puertas por item/código.
- [ ] Mecánica "código → +N llaves" (entrada de código que suma llaves, sin resolver puzzle; caso del Despacho).
- [ ] Re-balancear la economía con los números nuevos (Sótano = 5 llaves, Despacho = +2-3) y montar `npm run economy`.
- [ ] **Testing de soft-locks** (cuando existan los puzzles): buscar estados donde el grupo quede encerrado
  sin llaves + sin info para avanzar. El checker se amplía para mirar también info/items, no solo llaves.
- [ ] Diseñar el CONTENIDO del resto de puzzles (estilo Blue Prince, deducción/información).
- [ ] Escribir las descripciones de sala (La Cámara = doble nombre "Scriptorium").
- [ ] Derivar los props físicos del contenido.
```
