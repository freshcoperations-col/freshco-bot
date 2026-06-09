-- ============================================================
-- RBAC: roles y usuarios del admin
-- ============================================================

-- Roles con permisos granulares en JSONB
CREATE TABLE IF NOT EXISTS admin_roles (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        text        NOT NULL UNIQUE,
  description text        NOT NULL DEFAULT '',
  permissions jsonb       NOT NULL DEFAULT '{}',
  is_system   boolean     NOT NULL DEFAULT false,  -- true = no se puede eliminar
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Usuarios con acceso al admin (apuntados a un rol)
CREATE TABLE IF NOT EXISTS admin_users (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  email      text        NOT NULL UNIQUE,
  role_id    uuid        REFERENCES admin_roles(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all_admin_roles" ON admin_roles FOR ALL USING (true);
CREATE POLICY "service_role_all_admin_users" ON admin_users FOR ALL USING (true);

-- Rol "Admin" del sistema — todos los permisos activados
INSERT INTO admin_roles (name, description, is_system, permissions)
VALUES (
  'Admin',
  'Acceso total al panel. No se puede eliminar.',
  true,
  '{
    "orders_view": true,
    "orders_edit": true,
    "conversations_view": true,
    "analytics_view": true,
    "products_view": true,
    "products_edit": true,
    "products_pricing": true,
    "products_delete": true,
    "inventory_view": true,
    "inventory_edit": true,
    "colors_edit": true,
    "collections_edit": true,
    "sizes_edit": true,
    "coupons_edit": true
  }'
)
ON CONFLICT (name) DO NOTHING;

-- Rol "Operador" de ejemplo
INSERT INTO admin_roles (name, description, is_system, permissions)
VALUES (
  'Operador',
  'Puede gestionar pedidos y conversaciones.',
  false,
  '{
    "orders_view": true,
    "orders_edit": true,
    "conversations_view": true,
    "analytics_view": true,
    "products_view": true,
    "products_edit": false,
    "products_pricing": false,
    "products_delete": false,
    "inventory_view": true,
    "inventory_edit": false,
    "colors_edit": false,
    "collections_edit": false,
    "sizes_edit": false,
    "coupons_edit": false
  }'
)
ON CONFLICT (name) DO NOTHING;
