export const PERMISSION_DEFS = [
  { id: 'orders_view',       label: 'Ver pedidos',               section: 'Pedidos' },
  { id: 'orders_edit',       label: 'Gestionar pedidos',         section: 'Pedidos' },
  { id: 'conversations_view',label: 'Ver conversaciones',        section: 'Conversaciones' },
  { id: 'analytics_view',    label: 'Ver analíticas',            section: 'Analíticas' },
  { id: 'products_view',     label: 'Ver productos',             section: 'Productos' },
  { id: 'products_edit',     label: 'Crear y editar productos',  section: 'Productos' },
  { id: 'products_pricing',  label: 'Cambiar precios',           section: 'Productos' },
  { id: 'products_delete',   label: 'Eliminar productos',        section: 'Productos' },
  { id: 'inventory_view',    label: 'Ver stock global',          section: 'Inventario' },
  { id: 'inventory_edit',    label: 'Editar stock global',       section: 'Inventario' },
  { id: 'colors_edit',       label: 'Gestionar colores',         section: 'Colores' },
  { id: 'collections_edit',  label: 'Gestionar colecciones',     section: 'Colecciones' },
  { id: 'sizes_edit',        label: 'Gestionar guía de tallas',  section: 'Tallas' },
  { id: 'coupons_edit',      label: 'Gestionar cupones',         section: 'Cupones' },
] as const

export type PermissionId = typeof PERMISSION_DEFS[number]['id']
export type PermissionsMap = Record<PermissionId, boolean>

export const ADMIN_PERMISSIONS: PermissionsMap = Object.fromEntries(
  PERMISSION_DEFS.map((p) => [p.id, true]),
) as PermissionsMap

export function can(permissions: PermissionsMap | null | undefined, perm: PermissionId): boolean {
  if (!permissions) return false
  return permissions[perm] === true
}
