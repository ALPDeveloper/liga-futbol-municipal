# Arquitectura inicial

## Objetivo

Construir una plataforma multi-liga donde el publico consulte informacion sin cuenta, los administradores de liga capturen datos deportivos y los super administradores controlen membresias.

## Entidades principales

- `League`: liga, ciudad, temporada, estado de membresia, admin asignado, anuncios y destacados.
- `LeagueIdentity`: configuracion publica de cada liga: distintivo local, actividades, colores, texto de portada y recursos visuales.
- `LeagueRules`: estatutos configurables por liga, incluyendo manejo de bajas, puntos por default, marcador administrativo y limite de amarillas.
- `Team`: equipo perteneciente a una liga.
- `Player`: jugador perteneciente a un equipo y una liga.
- `Match`: partido con jornada, fecha, hora, sede, equipos, marcador y estado.
- `MatchEvent`: evento de acta: gol, amarilla, roja, sancion.
- `User`: cuenta administrativa.
- `Membership`: plan, fecha de renovacion, estado y restricciones.

## Separacion por liga

Todo registro operativo debe guardar `leagueId`. Ninguna consulta administrativa debe mezclar equipos, jugadores, partidos o sanciones entre ligas.

La identidad visual tambien se separa por liga. Tingüindín puede configurarse como el pueblo de las 3 campanas y mostrar actividades como aguacate y pan, pero esa informacion vive como datos de la liga, no como codigo especifico.

## Roles

- `super_admin`: crea, elimina, suspende y reactiva ligas. Administra membresias y asigna admins.
- `league_admin`: captura equipos, jugadores, calendario, resultados, goles, tarjetas y sanciones solo de su liga.
- `public`: lee datos publicados de ligas activas sin iniciar sesion.

La autenticacion local actual usa usuarios demo en SQLite, password hash con `crypto.scryptSync` y token firmado localmente. En produccion se debe mover a secretos de entorno, expiracion/refresh formal y politicas mas estrictas de autorizacion por endpoint.

## Calculos deportivos

La tabla de posiciones se calcula desde partidos finalizados:

- Victoria: 3 puntos.
- Empate: 1 punto.
- Derrota: 0 puntos.
- Criterios de orden: puntos, diferencia de goles, goles a favor, nombre.

Las estadisticas individuales salen de `MatchEvent`:

- `goal`: suma goles al jugador.
- `yellow`: suma amarillas.
- `red`: suma roja y sancion directa.
- Acumulacion: al llegar a 3 amarillas se propone 1 partido de sancion.

## Bajas de equipos

Un equipo puede marcarse como `withdrawn` desde una jornada determinada. Si la regla de la liga usa `award_walkover`, los partidos pendientes contra ese equipo se resuelven como `walkover` con el marcador administrativo configurado, por defecto 3-0 y 3 puntos para el rival. Si otra liga usa una regla distinta, se cambia en `LeagueRules` sin modificar codigo.

## Camino a app movil

La recomendacion es mantener una API compartida y clientes separados:

- Web: React/Next o similar.
- iOS/Android: Expo React Native.
- Backend: API REST o GraphQL con servicios de dominio para standings, scorers y discipline.
- Base de datos: PostgreSQL con `leagueId` indexado en tablas operativas.

## Backend local actual

La primera API local vive en `server/` y usa SQLite en `data/liga-futbol.sqlite`.

Endpoints base:

- `GET /api/health`: verifica API y ruta de base.
- `POST /api/auth/login`: inicia sesion local.
- `GET /api/auth/me`: valida token actual.
- `GET /api/users`: lista usuarios administrativos, solo super admin.
- `POST /api/users`: crea usuario administrativo, solo super admin.
- `PATCH /api/users/:userId`: actualiza usuario, liga asignada, estado o contraseña, solo super admin.
- `DELETE /api/users/:userId`: deshabilita usuario, solo super admin.
- `GET /api/audit-logs`: lista movimientos recientes, solo super admin.
- `GET /api/store`: regresa la informacion normalizada para la web.
- `PUT /api/store`: guarda el estado de la web en SQLite.
- `PATCH /api/leagues/:leagueId/rules`: actualiza reglas de liga.
- `POST /api/leagues/:leagueId/teams/:teamId/withdraw`: marca baja y genera defaults.
- `POST /api/matches/:matchId/walkover`: resuelve un partido por default administrativo.

## Membresias

El super admin controla plan, estado, fecha de renovacion, admin asignado y notas comerciales. Si una liga queda `suspended`, el admin de liga no puede entrar a editar; solo el super admin puede reactivarla. En la fase actual esos campos se exponen en la liga y se guardan en SQLite, con tabla `memberships` preparada para separar historial de pagos mas adelante.

## Usuarios administradores

Los usuarios se guardan en SQLite con `role`, `league_id`, `status` y `password_hash`. El super admin puede crear admins por liga, deshabilitarlos y asignar contrasenas temporales. El backend ya limita `PUT /api/store`: un `league_admin` solo puede guardar cambios de su propia liga y no puede guardar si su liga esta suspendida.

## Reglas por liga

Cada liga tiene un bloque `rules` persistido en `league_rules`. El admin de liga puede editar politica de baja, puntos por default, marcador administrativo, limite de amarillas, sancion base por roja y notas del reglamento. El endpoint `PATCH /api/leagues/:leagueId/rules` valida que el usuario pueda administrar esa liga y registra el cambio en auditoria.

## Disciplina y sanciones

La disciplina nace de dos fuentes. Los eventos del acta (`match_events`) registran goles, amarillas, rojas, motivo y partidos de sancion por roja. Para casos de comision disciplinaria existe `player_sanctions`, que permite capturar sanciones extraordinarias por jugador con tipo, partidos, motivo, fecha, estado y notas. `calculatePlayerStats` suma ambas fuentes para mostrar una sancion vigente total por jugador.

## Auditoria

La tabla `audit_logs` registra acciones sensibles con usuario, rol, liga, entidad, detalle y fecha. Hoy se registra inicio de sesion, guardado general, guardado de liga, cambios de usuarios, cambios de reglas, bajas de equipos y defaults administrativos. El panel de super admin consume `GET /api/audit-logs` para revisar esos movimientos sin exponerlos al publico ni a administradores de liga.
