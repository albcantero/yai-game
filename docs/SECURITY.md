# Seguridad — Santas Ochova

Notas de la auditoría (sep 2026). Lo de aquí **NO está en el repo**: vive en Supabase (RLS + RPC), así
que hay que revisarlo en el panel/SQL antes de jugar. La app cliente NO es la frontera de seguridad.

## 1. La privacidad de los DMs depende SOLO de la RLS (crítico)

El cliente (`src/lib/supabase.ts`) filtra los mensajes por UX (`fetchThread` con `.or(...)`,
`subscribeMessages` + `belongsToThread`), pero eso es **cosmético**: la URL y la anon key están en el
bundle (tienen que estarlo), así que cualquiera puede abrir la consola y consultar `messages`
directamente, o suscribirse a TODOS los INSERT por realtime. Si la RLS no está bien cerrada, se leen
los DMs ajenos. En un escape room con pistas secretas por rol, eso rompe el juego.

**Qué debe garantizar la RLS de `public.messages`:**
- **SELECT**: solo devolver una fila si `to_char IS NULL` (sala común) **o** el usuario actual es
  `from_char` **o** `to_char`.
- **INSERT**: `from_char` debe ser el username del usuario actual. No es solo privacidad: es
  **anti-suplantación**. Sin esta política, cualquier jugador puede forjar mensajes de cualquier
  personaje (mensajes falsos del "librero", pistas envenenadas) a cualquiera.
- **Nota para el echo local**: el cliente hace `insert(...).select().single()` para pintar tu propio
  mensaje al instante. La política de SELECT debe permitir leer tu **propia fila recién insertada** (la
  de abajo lo hace, vía `from_char = current_username()`); si no, el envío parecerá fallar aunque se
  haya guardado (y el mensaje aparecería luego por realtime).
- **Realtime**: hereda la RLS de SELECT (Supabase la aplica a `postgres_changes`), así que cerrando
  SELECT se cierra también lo que llega por la suscripción. Verifícalo.

**Plantilla** (adáptala a cómo resuelves identidad; asume un helper `public.current_username()` que
devuelve el username atado a `auth.uid()`, la misma lógica que tu RPC `me()`):

```sql
alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select using (
    to_char is null
    or from_char = public.current_username()
    or to_char   = public.current_username()
  );

create policy messages_insert on public.messages
  for insert with check (
    from_char = public.current_username()
  );
```

**Cómo verificar (hazlo de verdad):** con la anon key pública, logéate como la jugadora A e intenta
leer un DM entre B y C:
```js
const { data } = await supabase.from('messages')
  .select('*').eq('from_char','B').eq('to_char','C');
// data debe venir VACÍO. Si trae el mensaje, la RLS está abierta.
```
Repite suscribiéndote por realtime y comprobando que NO te llegan INSERT de DMs ajenos.

### 1.1. Tamaño y tasa de mensajes

Aunque la suplantación esté cerrada, un jugador legítimo puede abusar: `sendMessage` inserta `body`
sin cap de longitud (spam de varios MB / bloat de BD) y un `to_char` arbitrario (DM a un personaje
inexistente). Añade a la policy de INSERT un límite de tamaño, y valida el destinatario:

```sql
create policy messages_insert on public.messages
  for insert with check (
    from_char = public.current_username()
    and char_length(body) between 1 and 500
    and (to_char is null or exists (select 1 from public.characters c where c.username = to_char))
  );
```

Para limitar la **tasa** (evitar flood): cuenta los mensajes recientes del usuario en un trigger o en
la RPC de envío y rechaza tras N por minuto. Con 6 jugadoras es opcional, pero barato de añadir.

## 2. `characters` y `debug_logs`

- `allCharacters()` (`supabase.ts`) hace `select username,display_name` de `characters`: expón SOLO esas
  dos columnas por RLS. La columna de contraseña/hash NO debe ser legible por la anon key (solo la lee
  la RPC `login`, que corre con `security definer`).
- `debug_logs`: como la key es pública, cualquiera podría escribir ahí (o en `messages`). Cierra el
  INSERT con una policy o acéptalo como riesgo de spam a tu propia BD. Solo se usa con `?debug=1`.

## 3. Login sin rate-limit (alto)

`allCharacters()` enumera los usernames válidos y la RPC `login` se puede martillear sin límite desde la
key pública → fuerza bruta trivial en `yai-game.vercel.app`.
- **Mínimo barato**: contraseñas **largas y aleatorias** (no palabras cortas). Con 6 jugadoras es asumible.
- **Mejor**: rate-limit en la RPC `login` (p. ej. contar intentos por `auth.uid()`/IP en una tabla y
  rechazar tras N). Asegúrate de que `login` compara el hash en tiempo constante y devuelve el mismo
  error para "usuario no existe" y "clave incorrecta".

## 4. Cabeceras / CSP

No hay `vercel.json` ni CSP. Riesgo bajo (no se inyecta HTML no confiable: React escapa el chat y el
banner va por `textContent`), pero un CSP endurecería. Opcional.
