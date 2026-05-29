# Proyecto: Asignador y Seguimiento Altron

## Objetivo

Crear una aplicacion interna para asignar tareas, eventos, viajes, ofertas comerciales y pendientes por departamento. La app debe permitir seguimiento por avance, fechas vencidas, responsables, notificaciones, auditoria y visibilidad por permisos.

## Estado actual

La app ya funciona como prototipo web local en:

`http://127.0.0.1:8765/index.html`

Archivos principales:

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `sw.js`
- `assets/logo-altron.png`
- `assets/fondo-planta.jpg`

## Funciones actuales

- Login con correo y clave.
- Clave universal inicial: `Altron2026..`
- En primer ingreso obliga cambio de clave.
- Recordar contraseña prepara correo con clave temporal.
- Usuarios por departamento.
- Administrador principal: `sistemas@altroningenieria.com`
- Sistemas ve bitacora de cambios.
- Usuarios normales no ven bitacora.
- Departamentos:
  - Comercial
  - Contabilidad
  - Talento humano
  - Financiera
  - SST
  - Sistemas
  - Produccion
  - Diseno
  - Servicio tecnico
  - Compras
  - Almacen
  - Gerencia
  - Servicios generales
- Al seleccionar departamento, se cargan responsables de ese departamento.
- Opcion `Todos - Departamento`.
- Al seleccionar responsable, carga correo y celular automaticamente.
- Opcion para compartir tarea con personas de otros departamentos.
- Tarjetas de tareas con:
  - Responsable
  - Quien asigno
  - Departamento
  - Presentar a
  - Acceso extra
  - Fecha
  - Vencimiento
  - Lugar
  - Avance
  - Estado
  - Google Calendar
  - WhatsApp
  - Copiar
  - Eliminar
- Cuadros superiores filtran:
  - Pendientes
  - Vencidas
  - Avance promedio
  - Visitas
  - Ofertas comerciales
  - Viajes
- Al seleccionar una tarjeta, los indicadores superiores se actualizan con esa tarea.
- Reporte de seguimiento en HTML.
- Importacion basica de notas DOCX de Gemini para detectar proximos pasos.
- PWA basica con `manifest.webmanifest` y `sw.js`.

## Regla de permisos deseada

- Sistemas administra todo.
- Cada departamento ve solo sus tareas.
- Si una tarea debe ser vista por otro departamento, se agrega el correo de esa persona o de todo el departamento en `Compartir con correos`.
- Sistemas debe poder ver:
  - quien creo
  - quien actualizo
  - quien borro
  - fecha y hora
  - departamento afectado

## Siguiente fase recomendada

Conectar la app a Google corporativo:

### Google Sheets

Usar como base central para:

- usuarios
- departamentos
- tareas
- avances
- estados
- fechas
- permisos
- auditoria

### Google Drive

Usar para:

- documentos DOCX
- evidencias
- reportes
- adjuntos

### Google Calendar

Usar para:

- crear eventos
- invitar responsables
- recordatorios

### Google Apps Script

Usar como backend sin costo adicional:

- leer/escribir Google Sheets
- enviar correos de recuperacion
- proteger reglas de permisos
- registrar auditoria

## Plataformas deseadas

- Windows: app instalable o PWA.
- Mac: app instalable o PWA.
- Android: APK con Capacitor.
- iPhone: PWA desde Safari o app iOS con Capacitor. Para App Store se requiere cuenta Apple Developer.

## Recomendacion tecnica

Primera version real:

`PWA + Google Sheets + Google Drive + Google Apps Script`

Despues:

`Capacitor para Android APK`

Y luego:

`Electron/Tauri para Windows y Mac`

## Nota importante

El prototipo actual guarda datos en el navegador con `localStorage`. Para sincronizacion real entre usuarios y equipos, hay que migrar el almacenamiento a Google Sheets/Apps Script o a una base como Firebase/Supabase.

