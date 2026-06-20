# Supabase Storage para imagenes

Este flujo guarda fotos de jugadores, escudos y publicidad fuera de la base de datos.

## Variables requeridas en la API

```env
IMAGE_STORAGE_PROVIDER=supabase
IMAGE_UPLOAD_MAX_BYTES=1800000
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=service-role-key-solo-en-servidor
SUPABASE_STORAGE_BUCKET=ligatec-images
```

Importante: `SUPABASE_SERVICE_ROLE_KEY` solo debe vivir en el servidor/API. Nunca debe ir en Vercel frontend, navegador, codigo publico ni capturas.

## Crear o verificar bucket

Con las variables anteriores configuradas:

```bash
npm run setup:storage
```

El script crea o actualiza el bucket como publico, con limite de tamano y tipos permitidos:

- PNG
- JPG/JPEG
- WebP
- GIF

## Verificar antes de capturar fotos reales

```bash
npm run check:capture
```

Debe mostrar:

```txt
Storage imagenes: supabase
Bucket imagenes: ligatec-images
```

## Comportamiento de privacidad

- Si la foto del jugador esta autorizada, se sube y se guarda la URL.
- Si la foto no esta autorizada, no se guarda URL publica.
- En la vista publica solo se muestra foto cuando `photoAuthorized === true` y existe `photoUrl`.
