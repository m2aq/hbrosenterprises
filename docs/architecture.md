# Arquitectura Objetivo (Incremental y Segura)

## Principios

- No romper funcionalidad operativa actual.
- Mantener rendimiento.
- Migrar por fases con rollback inmediato.

## Capas

1. `UI`
- Render y eventos.
- Sin acceso directo a `localStorage` ni a cloud.

2. `Application Service`
- Reglas de negocio: validaciones, progreso, conflictos de horario.
- Expone operaciones como `addSession`, `removeField`, `listDashboard`.

3. `Data Provider`
- Interfaz estable:
  - `listFields`
  - `saveField`
  - `listWorkers`
  - `saveWorkers`
- Implementaciones:
  - `local` (actual)
  - `cloud` (futuro)
  - `dual` (transicion)

## Estrategia de migracion

1. Extraer provider local con contrato unico.
2. Crear provider cloud compatible.
3. Activar modo dual-write.
4. Verificar consistencia.
5. Cambiar lectura principal a cloud.
6. Mantener fallback local por seguridad en etapa inicial.
