# Liga Municipal Futbol

Primera base web para administrar y publicar informacion de ligas municipales de futbol.

## Abrir

Es una app React/Vite. Para instalar dependencias gratuitas:

```bash
npm install
```

Antes de correrla por primera vez, copia la configuracion de ejemplo:

```bash
cp .env.example .env
```

Para correr la API local con SQLite:

```bash
npm run dev:api
```

La base se guarda en:

`data/liga-futbol.sqlite`

Para correr la web en otra terminal:

```bash
npm run dev:web
```

Despues abre la URL que indique la terminal, normalmente `http://localhost:5173`.

Para probar desde un telefono en la misma red Wi-Fi:

```bash
npm run dev:api:lan
npm run dev:lan
```

Despues abre en el telefono la URL `Network` que indique Vite, por ejemplo `http://192.168.x.x:5173`.

Para validar compilacion:

```bash
npm run build
```

Para correr una prueba rapida de calculos deportivos:

```bash
npm test
```

Para crear un respaldo manual de SQLite:

```bash
npm run backup:db
```

Los respaldos se guardan en `backups/` salvo que `BACKUP_DIR` indique otra ruta. Si `DATABASE_PROVIDER=postgres`, el comando genera un respaldo logico JSON desde Postgres.

Para exportar todo el estado actual a JSON antes de migrar o subir piloto:

```bash
npm run export:store
```

El archivo queda en `backups/store-export-FECHA.json`.

Para generar un SQL de carga para Supabase/Postgres:

```bash
npm run export:supabase-sql
```

El archivo queda en `backups/supabase-seed-FECHA.sql` y contiene usuarios con hashes de contraseña. Tratalo como archivo sensible.

Para generar ambos archivos del piloto de una sola vez:

```bash
npm run pilot:exports
```

Para probar conexion con Supabase/Postgres, copia `.env.supabase.example` como `.env`, configura `DATABASE_URL` y ejecuta:

```bash
npm run check:postgres
```

Para crear las tablas en Supabase desde el esquema local:

```bash
npm run setup:postgres-schema
```

Para revisar que la configuracion de produccion no arranque insegura:

```bash
npm run check:production-config
```

Para levantar la API usando Postgres:

```bash
npm run dev:api:postgres
```

## Configuracion

Las variables principales viven en `.env`:

- `API_HOST`: direccion donde escucha la API. En local puede ser `127.0.0.1`; para red local, `0.0.0.0`.
- `API_PORT`: puerto de la API, por defecto `3001`.
- `AUTH_SECRET`: secreto privado para firmar sesiones. En produccion debe ser largo y unico.
- `TOKEN_TTL_HOURS`: horas de vigencia de sesion.
- `LOGIN_MAX_ATTEMPTS`: intentos fallidos antes de bloquear una cuenta.
- `LOGIN_LOCK_MINUTES`: minutos que dura el bloqueo temporal.
- `SHOW_RECOVERY_CODE_IN_RESPONSE`: en desarrollo puede ser `true`; en produccion debe ser `false`.
- `DB_PATH`: ruta de la base SQLite.
- `BACKUP_DIR`: carpeta de respaldos.
- `DATABASE_PROVIDER`: `sqlite` para desarrollo local o `postgres` para Supabase/Postgres.
- `DATABASE_URL`: cadena de conexion Postgres/Supabase para el adaptador de produccion.
- `DATABASE_SSL`: `true` para Supabase; `false` solo para Postgres local sin SSL.
- `CORS_ORIGIN`: dominio permitido para consumir la API en produccion.
- `VITE_API_BASE_URL`: URL de API para el frontend; en produccion puede ser `/api` si web y API comparten dominio.

En produccion la API no arranca si falta `AUTH_SECRET`, si el secreto es muy corto, si `CORS_ORIGIN` queda abierto, si `SHOW_RECOVERY_CODE_IN_RESPONSE=true`, o si `DATABASE_PROVIDER=postgres` no tiene `DATABASE_URL`.

## Accesos

La vista publica de una liga vive en `/liga/ID_DE_LIGA`.

La app puede seguir abriendo `/` en desarrollo, pero para compartir a usuarios reales conviene usar la URL directa por liga.

El panel privado vive en `/admin`. No se muestra en la portada publica.

## Que incluye

- Soporte multi-liga desde el modelo de datos.
- Identidad configurable por liga: municipio, distintivo local, actividades, colores, texto publico y anuncio.
- Vista publica sin login para tabla, calendario, goleadores, disciplina, destacados y patrocinador.
- Login local con roles de super admin y admin de liga.
- Panel de super admin para crear, suspender, reactivar y eliminar ligas.
- Panel operativo de ligas: estado, URL publica, admin asignado y notas internas.
- Panel de usuarios administradores por liga: crear, editar, asignar liga, cambiar contraseña y deshabilitar.
- Panel de admin de liga para crear, editar y eliminar equipos, jugadores y partidos.
- Acta de partido guiada para capturar marcador, goles, amarillas, rojas y sanciones por jugador.
- Control inicial de equipos dados de baja a medio torneo con defaults segun reglas de liga.
- Tabla de posiciones calculada automaticamente desde partidos finalizados.
- Estadisticas de goleadores, amarillas, rojas y sanciones calculadas desde eventos de partido.
- Backend local Express + SQLite, con fallback a `localStorage` si la API no esta corriendo.
- Auditoria para super admin con inicios de sesion, cambios de usuarios, membresias, reglas, bajas y defaults.
- Auditoria con resumen, filtros por liga/accion/nivel/fecha y marcas visuales para eventos criticos.

## Bajas de equipos

Cada liga tiene reglas propias. Por defecto, si un equipo se marca como baja desde cierta jornada, sus partidos pendientes se resuelven como `walkover`: el rival gana 3-0 y suma 3 puntos. Esa regla queda en `league_rules` para poder cambiarla por liga segun estatutos.

Desde el panel de Admin de liga se pueden editar los estatutos operativos: politica de baja, puntos por default, marcador por default, amarillas para suspension, partidos base por roja y notas internas del reglamento.

## Sanciones disciplinarias

El acta permite capturar rojas con partidos y motivo, pero tambien existe un bloque de sanciones extraordinarias para resoluciones de comision: agresion, insultos, rina, sanciones administrativas u otros casos. Estas sanciones se asignan a un jugador, tienen numero de partidos, motivo, fecha y notas, y se suman a las sanciones calculadas desde tarjetas.

## Usuarios demo de desarrollo

- Super admin: `super@ligafut.local` / `super123`
- Admin Tingüindín: `admin.tinguindin@demo.com` / `admin123`

Estos accesos son solo para desarrollo. Antes de usar la app con una liga real, crea un nuevo super admin, valida que puedes entrar con el usuario nuevo y elimina o deshabilita los usuarios demo.

El panel de usuarios aparece iniciando sesion como super admin en `/admin`.

El panel de auditoria tambien aparece para super admin y muestra los ultimos movimientos guardados en SQLite.

## Preparacion para produccion

Antes de lanzar para uso real:

- Definir dominio y servidor.
- Configurar `.env` con `NODE_ENV=production`, `AUTH_SECRET`, `DB_PATH`, `BACKUP_DIR` y `CORS_ORIGIN`.
- Ejecutar `npm run build`.
- Servir `dist/` con un servidor web y proxy hacia `/api`.
- Levantar API con `npm run start:api`.
- Programar respaldos diarios ejecutando `npm run backup:db`.
- Cambiar o eliminar usuarios demo.
- Configurar `SHOW_RECOVERY_CODE_IN_RESPONSE=false`.
- Hacer una prueba completa con datos reales de una jornada.

Para piloto con Supabase/Vercel, revisar `docs/piloto-supabase.md`.

Para piloto gratuito completo, revisar `docs/entorno-gratuito.md`.

Antes de capturar datos reales que deben sobrevivir a produccion, revisar `docs/captura-produccion.md` y ejecutar:

```bash
npm run check:capture
```

## Roles

- `super_admin`: controla ligas, membresias, suspension y usuarios.
- `league_admin`: administra una liga asignada.
- `public`: consulta informacion sin cuenta.

## Control operativo de ligas

La plataforma opera sin limites comerciales de equipos, torneos o jugadores. El super admin puede crear ligas, revisar su URL publica, asignar correo administrativo, guardar notas internas y suspender o reactivar una liga cuando sea necesario.

Si una liga queda `suspended`, el admin de liga no puede entrar a editar; solo el super admin puede reactivarla. La logica actual de calculo deportivo esta en `src/lib/domain.js` para que pueda moverse despues a servicios compartidos por web, iOS y Android.
