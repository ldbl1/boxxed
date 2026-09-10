# Boxxed

Inventario doméstico con ítems, categorías y ubicaciones jerárquicas. Permite subir imágenes, organizar galerías y marcar zonas de una foto para describir ubicaciones hijas.

## Requisitos

- Docker Engine 24 o posterior
- Docker Compose v2

No es necesario instalar Node.js para ejecutar la versión Docker.

## Ejecutar con Docker Compose

```bash
git clone https://github.com/ldbl1/boxxed.git
cd boxxed
docker compose up -d --build
```

La aplicación quedará disponible en:

```text
http://localhost:3001
```

### Probar desde un móvil

El ordenador y el móvil deben estar conectados a la misma red Wi-Fi. Obtén la IP local del ordenador:

```powershell
ipconfig
```

Busca la dirección `IPv4`, por ejemplo `192.168.1.25`, y abre desde el móvil:

```text
http://192.168.1.25:3001
```

La aplicación escucha en `0.0.0.0`, pero Windows Firewall puede bloquear el puerto. En PowerShell como administrador, crea una regla de entrada:

```powershell
New-NetFirewallRule -DisplayName "Boxxed 3001" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow
```

Si usas Docker Desktop, comprueba que el puerto esté publicado con:

```powershell
docker compose ps
```

No funcionará desde la red móvil del teléfono si el ordenador está en Wi-Fi: ambos deben estar en la misma red local, sin aislamiento de clientes activado en el router.

Comprobar el estado:

```bash
docker compose ps
docker compose logs -f boxxed
```

Comprobar salud:

```bash
curl http://localhost:3001/health
```

La respuesta esperada es:

```json
{"status":"ok"}
```

## Datos persistentes

Docker Compose crea dos volúmenes:

- `boxxed-data`: base de datos SQLite.
- `boxxed-uploads`: imágenes subidas.

Los datos sobreviven a `docker compose down` y a la reconstrucción de la imagen. Para borrar también los datos, hay que hacerlo explícitamente:

```bash
docker compose down -v
```

## Actualizar la instalación

```bash
git pull
docker compose up -d --build
```

## Copia de seguridad

Crear una copia de los volúmenes antes de actualizar o mover la instalación:

```bash
docker run --rm \
  -v boxxed-data:/data \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/boxxed-data.tar.gz -C /data .

docker run --rm \
  -v boxxed-uploads:/uploads \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/boxxed-uploads.tar.gz -C /uploads .
```

En PowerShell, `$PWD` también apunta al directorio actual. Si el volumen tiene otro nombre, se puede consultar con:

```bash
docker volume ls
```

## Ejecutar sin Docker

```bash
npm ci
npm start
```

La aplicación usa el puerto `3001` por defecto. Se puede cambiar:

```bash
PORT=3001 npm start
```

Para guardar la base de datos en otra carpeta:

```bash
DATA_DIR=./data npm start
```

En PowerShell:

```powershell
$env:PORT = "3001"
$env:DATA_DIR = ".\data"
npm.cmd start
```

## Publicar en GitHub

```bash
git init
git add .
git commit -m "Prepare Boxxed for Docker deployment"
git branch -M main
git remote add origin https://github.com/USUARIO/boxxed.git
git push -u origin main
```

Sustituye la URL del remoto por la de tu repositorio. La base de datos local y las imágenes subidas están excluidas mediante `.gitignore`.

## Estructura de despliegue

- `Dockerfile`: imagen de producción.
- `docker-compose.yml`: servicio, puerto, healthcheck y volúmenes.
- `.dockerignore`: archivos que no entran en la imagen.
- `.gitignore`: datos locales que no deben publicarse.
- `data/` dentro del contenedor: SQLite persistente.
- `uploads/` dentro del contenedor: imágenes persistentes.

## Licencia

El proyecto mantiene la licencia declarada en `package.json`.
