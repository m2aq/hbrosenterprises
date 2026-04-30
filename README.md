# HBros Enterprises Codex

Base profesional para evolucionar la web app de monitoreo de campo sin romper funcionalidad actual.

## Objetivo

- Mantener estabilidad y rendimiento.
- Preparar arquitectura para base de datos en la nube.
- Permitir migracion gradual con fallback local.

## Estructura

- `frontend/`: UI web.
- `backend/`: API y capa de datos.
- `shared/`: contratos y utilidades comunes.
- `docs/`: arquitectura, decisiones y plan de migracion.

## Stack inicial

- Frontend: HTML + JS modular (sin lock-in de framework).
- Backend: Node.js + Express.
- Datos: interfaz por proveedor (`local` hoy, `cloud` despues).

## Inicio rapido

1. Backend
```bash
cd backend
npm install
npm run dev
```

2. Frontend

Abrir `frontend/index.html` en navegador para verificar el bootstrap inicial.

## Publicar en GitHub Pages

Este repositorio ya incluye `index.html` en la raiz, asi que GitHub Pages lo detecta facilmente.

1. Sube esta carpeta a un repositorio en GitHub.
2. En GitHub, abre `Settings > Pages`.
3. En `Build and deployment`, selecciona:
- `Source`: `Deploy from a branch`
- `Branch`: `main` (o la rama que uses), carpeta `/ (root)`
4. Guarda y espera el deploy (1-3 minutos).

La raiz redirige automaticamente a `frontend/index.html`.

## Nota de backend

GitHub Pages solo publica frontend estatico.  
Cuando conectemos base de datos en nube, el backend se despliega aparte (Render/Railway/Supabase Edge Functions), sin romper la publicacion del frontend.

## Supabase Setup (Free)

La app ya incluye sincronizacion opcional a Supabase desde el panel `Cloud Sync (Supabase)` (solo supervisor).

1. Crea proyecto en Supabase (plan free).
2. En SQL Editor, ejecuta:

```sql
create table if not exists public.app_state (
  id text primary key,
  workers jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
```

3. En `Project Settings > API`, copia:
- `Project URL`
- `anon public key`

4. En la app, abre `Cloud Sync (Supabase)`:
- pega URL y key
- activa `Enable cloud sync`
- `Save Cloud Settings`
- `Test Connection`
- `Sync Now`

## Siguientes pasos recomendados

1. Integrar el codigo actual de la app en `frontend/src/` por modulos.
2. Migrar acceso a datos a la capa `DataProvider`.
3. Activar modo dual (`local + cloud`) antes del corte final.
