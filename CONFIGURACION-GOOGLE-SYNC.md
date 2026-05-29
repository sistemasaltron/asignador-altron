# Asignador Altron - Version preparada para Google Sync

Esta version conserva el funcionamiento local, pero agrega una capa para sincronizar con Google Sheets mediante Google Apps Script.

## 1. Probar localmente

Abre `index.html`. Si `GOOGLE_APPS_SCRIPT_URL` esta vacio en `app.js`, la aplicacion trabaja en modo local con `localStorage`.

## 2. Crear la base central en Google

1. Entra a `script.google.com` con el correo corporativo de Sistemas.
2. Crea un proyecto nuevo llamado `Asignador Altron Backend`.
3. Borra el contenido inicial de `Code.gs`.
4. Copia y pega el contenido del archivo `google-backend.gs`.
5. Guarda.
6. Ejecuta la funcion `setup()` una vez.
7. Acepta permisos.
8. La funcion crea un Google Sheets llamado `Asignador Altron - Base Central`.

## 3. Publicar el backend

1. En Apps Script, entra a `Implementar > Nueva implementacion`.
2. Selecciona tipo `Aplicacion web`.
3. Ejecutar como: `Yo`.
4. Acceso: recomendado `Cualquier usuario de la organizacion` si Google Workspace lo permite. Para pruebas, puedes usar `Cualquier usuario con el enlace`.
5. Copia la URL generada.

## 4. Conectar la app

Abre `app.js` y cambia esta linea:

```js
const GOOGLE_APPS_SCRIPT_URL = "";
```

Por la URL de Apps Script:

```js
const GOOGLE_APPS_SCRIPT_URL = "https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec";
```

Guarda y vuelve a abrir la app.

## 5. Que sincroniza

- Tareas y asignaciones.
- Auditoria visible para Sistemas.
- Claves cambiadas por usuario.
- Recuperacion de clave con clave temporal.

## 6. Importante

Esta es una base MVP. Para uso empresarial fuerte, el siguiente paso es mejorar seguridad con autenticacion real de Google, control de sesiones y subida formal de evidencias a Google Drive.
