# Manual de Despliegue en Railway - AutoMaster ERP

Este documento contiene todas las instrucciones, configuraciones y variables de entorno necesarias para desplegar la plataforma AutoMaster ERP 100% en [Railway](https://railway.app/).

Dado que nuestra arquitectura es de **microservicios**, desplegaremos tres servicios independientes y una base de datos.

---

## 1. Arquitectura de Despliegue en Railway

Necesitarás crear los siguientes servicios dentro de un mismo **Project** en Railway:
1. **PostgreSQL** (Base de datos nativa de Railway)
2. **Backend (Django)** (Servicio web Python)
3. **Frontend (React/Vite)** (Servicio web Node estático o Nginx)
4. **WhatsApp Microservice** (Servicio web Node.js)

---

## 2. Preparación del Proyecto (Root Directory)

Railway detectará automáticamente el código base, pero para aplicaciones mono-repositorio como esta, debes configurar el "Root Directory" de cada servicio en la pestaña **Settings** > **Root Directory**.

- Para el Backend, el Root Directory es: `/backend`
- Para el Frontend, el Root Directory es: `/frontend`
- Para el Microservicio, el Root Directory es: `/whatsapp-service`

---

## 3. Despliegue Paso a Paso

### A. Base de Datos (PostgreSQL)
1. En tu proyecto de Railway, haz clic en **New** > **Database** > **Add PostgreSQL**.
2. Railway generará automáticamente las credenciales. Estas se inyectarán en tus otros servicios si están en el mismo entorno.

### B. Backend (Django)
1. Haz clic en **New** > **GitHub Repo** y selecciona este repositorio.
2. Ve a **Settings** de este nuevo servicio.
3. Cambia el **Root Directory** a `/backend`.
4. En **Variables**, añade las siguientes:
   - `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` (Railway provee esta referencia automática).
   - `DEBUG`: `False`
   - `SECRET_KEY`: `(Genera una clave secreta fuerte aquí)`
   - `CORS_ALLOWED_ORIGINS`: `https://tu-dominio-frontend.up.railway.app` (El dominio que Railway le dé a tu Frontend).
   - `OPENAI_API_KEY`: `tu-api-key-de-openai` (Para el Asistente IA).
5. **Comandos de Inicio (Start Command)**:
   - Necesitarás un servidor WSGI para producción (gunicorn). Si no está en `requirements.txt`, deberás agregarlo.
   - Start Command: `python manage.py migrate && gunicorn automaster.wsgi:application --bind 0.0.0.0:$PORT`
6. En **Settings** > **Networking**, haz clic en **Generate Domain** para obtener la URL pública del backend.

### C. Frontend (React / Vite)
1. Haz clic en **New** > **GitHub Repo** y selecciona este repositorio.
2. Ve a **Settings** y cambia el **Root Directory** a `/frontend`.
3. En **Variables**, añade:
   - `   ` (El dominio generado en el paso B).
4. **Builder / Comandos**: 
   - Railway detectará Node.js. 
   - Build Command: `npm run build`
   - Start Command: Sirve la carpeta `dist`. Es muy recomendable usar `serve` u otro servidor estático: `npx serve -s dist -l $PORT`.
5. En **Networking**, haz clic en **Generate Domain**.

### D. WhatsApp Microservice (Node.js)
1. Haz clic en **New** > **GitHub Repo** y selecciona este repositorio.
2. Ve a **Settings** y cambia el **Root Directory** a `/whatsapp-service`.
3. **Builder / Comandos**:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. En **Networking**, haz clic en **Generate Domain**.
5. *Nota Importante*: Para conectar WhatsApp, tendrás que ver los **Logs** de este servicio en Railway apenas se despliegue. Ahí aparecerá el código QR que debes escanear con tu celular. Una vez escaneado, la sesión persistirá temporalmente en el volumen de Railway. (Para producción real, se recomienda montar un "Volume" persistente en la carpeta `auth_info_baileys/`).

---

## 4. Consideraciones Adicionales

1. **Archivos Estáticos (Django)**: En producción, Django no sirve archivos estáticos (`css`, `js`, admin panel) por defecto. Deberás configurar `WhiteNoise` en el backend para que Railway sirva estos archivos correctamente, y ejecutar `python manage.py collectstatic` durante el build.
2. **Volúmenes**: Railway es efímero. Si el contenedor del Microservicio de WhatsApp se reinicia, se pedirá escanear el QR nuevamente a menos que añadas un **Volume** persistente en Railway y lo montes en el Root Directory `/whatsapp-service/auth_info_baileys`.
3. **CORS**: Asegúrate de que los dominios públicos generados para el Frontend estén incluidos en la lista blanca de CORS del Backend (`CORS_ALLOWED_ORIGINS`).
