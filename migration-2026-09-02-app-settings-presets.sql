-- =====================================================================
-- Migration: tabla app_settings + documento "presets"
--
-- Un único documento de configuración (una fila, una columna jsonb) que
-- guarda los valores rápidos del formulario de producto y las plantillas.
-- Se lee de una sola vez al abrir el formulario.
--
-- Ejecutar en Supabase Dashboard → SQL Editor.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Solo el backend del bot (service_role) toca esta tabla. El admin pasa
-- siempre por /api/admin/web/presets, que valida permisos.
DROP POLICY IF EXISTS "service_role_all_app_settings" ON app_settings;
CREATE POLICY "service_role_all_app_settings" ON app_settings FOR ALL USING (true);

-- Seed inicial. ON CONFLICT DO NOTHING para poder re-correr la migración
-- sin pisar los valores que el usuario ya haya editado desde el admin.
INSERT INTO app_settings (key, value)
VALUES (
  'presets',
  '{
    "materiales": [
      { "id": "mat-1", "valor": "100% algodón", "orden": 0, "esDefault": true },
      { "id": "mat-2", "valor": "Algodón 90% / Poliéster 10%", "orden": 1, "esDefault": false },
      { "id": "mat-3", "valor": "Poliéster 100%", "orden": 2, "esDefault": false },
      { "id": "mat-4", "valor": "Franela", "orden": 3, "esDefault": false }
    ],
    "metodos_impresion": [
      { "id": "imp-1", "valor": "DTF", "orden": 0, "esDefault": true },
      { "id": "imp-2", "valor": "Serigrafía", "orden": 1, "esDefault": false },
      { "id": "imp-3", "valor": "Bordado", "orden": 2, "esDefault": false },
      { "id": "imp-4", "valor": "Sublimación", "orden": 3, "esDefault": false }
    ],
    "precios": [
      { "id": "pre-1", "valor": 70000, "orden": 0, "esDefault": false },
      { "id": "pre-2", "valor": 80000, "orden": 1, "esDefault": false },
      { "id": "pre-3", "valor": 90000, "orden": 2, "esDefault": false },
      { "id": "pre-4", "valor": 110000, "orden": 3, "esDefault": false }
    ],
    "precios_oferta": [
      { "id": "ofe-1", "valor": 50000, "orden": 0, "esDefault": false },
      { "id": "ofe-2", "valor": 60000, "orden": 1, "esDefault": false },
      { "id": "ofe-3", "valor": 70000, "orden": 2, "esDefault": false }
    ],
    "descuentos": [
      { "id": "des-1", "valor": 10, "orden": 0, "esDefault": false },
      { "id": "des-2", "valor": 20, "orden": 1, "esDefault": false },
      { "id": "des-3", "valor": 30, "orden": 2, "esDefault": false }
    ],
    "plantillas": [
      {
        "id": "camiseta-estandar",
        "nombre": "Camiseta estándar",
        "garment_type": "camisetas",
        "price": 90000,
        "sale_price": 70000,
        "on_sale": false,
        "available": true,
        "featured": false,
        "free_shipping": false,
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Vainilla", "Negro"],
        "material": "100% algodón",
        "printing_method": "DTF"
      },
      {
        "id": "hoodie-estandar",
        "nombre": "Hoodie estándar",
        "garment_type": "hoodies",
        "price": 150000,
        "sale_price": null,
        "on_sale": false,
        "available": true,
        "featured": false,
        "free_shipping": false,
        "sizes": ["S", "M", "L", "XL"],
        "colors": ["Negro"],
        "material": "Algodón 90% / Poliéster 10%",
        "printing_method": "DTF"
      },
      {
        "id": "gorra-estandar",
        "nombre": "Gorra estándar",
        "garment_type": "gorras",
        "price": 60000,
        "sale_price": null,
        "on_sale": false,
        "available": true,
        "featured": false,
        "free_shipping": false,
        "sizes": ["L/XL"],
        "colors": ["Negro"],
        "material": "Algodón 100%",
        "printing_method": "Bordado"
      }
    ]
  }'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- Nuevo permiso presets_edit: activarlo en el rol Admin del sistema.
-- Los owners (ADMIN_EMAILS) lo reciben automáticamente porque sus permisos
-- se derivan de PERMISSION_DEFS en el código.
UPDATE admin_roles
SET permissions = permissions || '{"presets_edit": true}'::jsonb
WHERE name = 'Admin';

-- Los roles no-Admin arrancan sin el permiso (ausente = false).
UPDATE admin_roles
SET permissions = permissions || '{"presets_edit": false}'::jsonb
WHERE name <> 'Admin' AND NOT (permissions ? 'presets_edit');

COMMIT;

-- Verificación
SELECT key, jsonb_object_keys(value) AS listas FROM app_settings WHERE key = 'presets';
SELECT name, permissions -> 'presets_edit' AS presets_edit FROM admin_roles;
