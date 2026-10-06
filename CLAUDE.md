# Freshco — bot de WhatsApp + backend

## Qué es
Backend único de **Freshco** (ropa urbana, Bogotá, marca 100% online). Este repo:
- atiende WhatsApp 24/7 con un agente de IA que vende con el catálogo real,
- es el **API de la tienda web** (checkout, cupones, OTP, inventario) y del **panel admin**,
- recibe los webhooks de Meta (WhatsApp) y Wompi (pagos).

No tiene interfaz propia: `app/page.tsx` es solo una página de estado.

## Ecosistema (repos hermanos en `../`)
| Repo | Qué es | Deploy |
|---|---|---|
| `Project-store` (este) | bot + API | Vercel `freshco-bot-l75x` |
| `freshco-webpage` | tienda (Vite + React) | freshco-design.com |
| `freshco-admin` | panel admin (Next.js) — llama a `/api/admin/web/*` con el token de Supabase del admin | admin.freshco-design.com |

**`git push` a `main` = deploy automático en Vercel.** No hace falta build ni deploy manual.

## Base de datos — Supabase proyecto **WEB**
- El proyecto viejo `freshco-bot` está pausado: no usarlo. Ojo: la `.env.local` local de este repo todavía apunta a él. Las variables buenas están en Vercel.
- **Migraciones**: archivos `migration-AAAA-MM-DD-*.sql` en la raíz. Las corre el dueño a mano en el SQL Editor. Si el código nuevo lee columnas nuevas, la migración va **antes** del deploy.
- `products.is_test`: producto de prueba. No sale en listas, búsqueda, más vendidos, bot ni analíticas; sí se compra por link directo.
- `products_full` es una vista con `p.*`, que se expande al crearla: si agregas columnas a `products`, hay que **recrear la vista**. La última definición está en `migration-2026-10-04-test-products.sql`.

### Permisos (desde `migration-2026-10-04-security-lockdown.sql`)
- El bot usa la **llave de servicio** (`createServerClient`), que no pasa por RLS.
- La llave pública (la de la tienda) solo puede **leer** `products`, `collections`, `garment_types`, `banners` activos y la función `bestseller_counts()`. Un cliente con sesión lee **sus** pedidos (`orders` por correo).
- Ninguna escritura con la llave pública. Todo lo que escribe pasa por este API.
- Si una tabla nueva debe leerse desde la tienda, agrega su política `TO anon, authenticated` en una migración. Nunca `USING (true)` sin `TO`: eso aplica a todos los roles, incluido el público.

## Seguridad de los flujos de dinero
- **Checkout web** = `POST /api/orders/checkout`. El navegador manda solo productos, tallas, colores y cantidades, más el token de sesión. El servidor lee precios, valida stock y cupón, calcula el envío, crea el pedido y firma en Wompi **solo el monto que él calculó**.
- **Webhook Wompi**: verifica la firma, compara el monto pagado con `amount_in_cents` del pedido (si no coincide: `revision_monto` + alerta), es idempotente y aplica stock.
- **Webhook WhatsApp**: verifica `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`. Si falta la variable, acepta y deja una advertencia en el log.
- **Cupones** (`lib/coupons.ts`): validar no consume el cupón. El uso se registra al crear el pedido.
- Rutas `/api/admin/web/*`: siempre `verifyAdmin` (el token de Supabase, más `ADMIN_EMAILS` para los dueños o `admin_users` con su rol).

## Protección de datos (Ley 1581)
- Política en `freshco-webpage/src/data/legal.js` (slug `privacidad`). Si cambia el texto, sube `PRIVACY_POLICY_VERSION` en la web Y en `lib/store-info.ts`.
- Cada pedido guarda la prueba de autorización: `privacy_consent_at`, `privacy_consent_channel` (web / whatsapp / admin), `privacy_policy_version`. El checkout web la exige (casilla); el bot comparte el link al pedir datos.
- Si se agrega un proveedor nuevo que reciba datos de clientes, hay que listarlo en la política.

## Mapa de `lib/`
- `agent.ts`, `system-prompt.ts`: agente de IA (tools + prompt con datos vivos de la tienda)
- `products-db.ts`, `product-fields.ts`, `product-catalog.ts`: catálogo
- `inventory.ts`: **punto único de stock**. `applyOrderStock` (venta o reversa) es idempotente y queda en el libro de movimientos.
- `pricing.ts`: **único lugar donde se calcula un pedido** (precios, oferta, stock, cupón, envío). Lo usan el checkout web y las herramientas del bot; ni el navegador ni la IA ponen precios.
- `coupons.ts`: `checkCoupon` (aviso temprano) y `claimCoupon` (reserva atómica en la base, `claim_coupon`). Reglas: uno por cliente, solo primera compra.
- `rate-limit.ts`: freno de intentos en Postgres (`rate_limit_hit`).
- `shipping.ts`, `wompi.ts`, `email.ts`
- `notify.ts`: alertas al equipo por WhatsApp (`TEAM_WHATSAPP_NUMBERS`; fuera de la ventana de 24 h usa las plantillas `pedido_equipo` y `conversacion_equipo`) y, si existe `NTFY_TOPIC`, también por ntfy
- `store-info.ts`: datos de la tienda, horario de asesores (`humanAvailability`) y la política de datos (`PRIVACY_POLICY_URL`, `PRIVACY_POLICY_VERSION`, igual a la de `freshco-webpage/src/data/legal.js`)
- `admin-auth.ts`, `admin-cors.ts`, `permissions.ts`: acceso al admin
- `storage-images.ts`: URLs de imágenes en Supabase Storage

## Convenciones
- Español colombiano en textos al cliente. Precios en COP, formato `$XX.XXX`.
- **Next 16 + React 19** (bot y admin). En rutas dinámicas `params` es una Promise: `props: { params: Promise<{ id: string }> }` y `const params = await props.params`.
- Un archivo `route.ts` de Next solo puede exportar handlers (GET, POST…). Los helpers van en `lib/`.
- El body de una función de Vercel tiene un máximo de 4.5 MB (más grande da 413, y sin CORS). Las imágenes se comprimen en el cliente.
- Nada de `[...map.values()]`, porque el tsconfig no tiene downlevelIteration: usa `Array.from`.
- Verificar con `npx tsc --noEmit` (y `npm run build` si tocas rutas).
