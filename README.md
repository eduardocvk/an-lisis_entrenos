# Rastro · Análisis de carrera

Dashboard personal para estudiar entrenamientos reales, alojable en GitHub Pages, con almacenamiento local o Supabase privado. Interfaz en español y fechas en Europe/Madrid.

## Acceso a la instalación activa

Abre [Rastro](https://eduardocvk.github.io/an-lisis_entrenos/) y pulsa **Iniciar sesión**. Utiliza el correo de tu cuenta de Supabase y la contraseña independiente que has establecido para Rastro. La URL y la clave publicable se incorporan al build desde variables de GitHub; no necesitas copiarlas en la web.

El proyecto independiente `rastro-entrenos` está en la organización `eduardocvk`, plan Free y región `eu-west-3` (París). Las altas públicas están deshabilitadas. El proyecto anterior `analizador_gpx` permanece separado.

## Primera versión

La interfaz usa azul tinta, violeta y coral, texto ampliado y explicaciones desplegables. La vista general añade volumen mensual, frecuencia por día de la semana y duración por sesión. Recuperación muestra todos los registros sincronizados y el número de días con mediciones reales.

El workflow **Completar histórico Garmin** recorre todas las carreras, omite las ya importadas y consulta hasta 90 días pendientes de recuperación por ejecución desde la primera carrera conocida. Se ejecuta cada hora mientras `GARMIN_SYNC_ENABLED=true`; comparte el bloqueo con la sincronización habitual. Un día sin medición no se convierte en cero. Los errores temporales quedan pendientes de reintento. La disponibilidad anterior depende del histórico conservado por Garmin y de los dispositivos utilizados.

- Importación múltiple de FIT con el SDK oficial de Garmin, GPX con tiempos, ZIP de FIT y copias JSON de Rastro. Rechaza archivos dañados y actividades FIT que no sean de carrera. No contiene entrenamientos ficticios.
- Resumen, explorador con filtros, kilómetros por semana, ritmo global ponderado y desnivel disponible.
- Detalle de sesión con mapa, pulso, ritmo, altitud, cadencia y potencia cuando existen. Selección de intervalo de distancia para resaltarlo en el mapa.
- Comparación de hasta cuatro actividades por distancia, ritmo, pulso y altitud.
- Rendimiento: dispersión ritmo/pulso, evolución temporal, mejores esfuerzos estimados y cambio de eficiencia entre mitades.
- Vueltas e intervalos originales del FIT; GPX no incluye estructura de vueltas.
- Carga semanal por minutos × RPE, distribución temporal por cinco zonas editables y semanas sin entrenamientos visibles.
- Análisis de ritmo por pendiente sobre tramos de al menos 100 m.
- Diario de esfuerzo percibido, etiquetas y sensaciones con confirmación de guardado.
- Mapa de cobertura y frecuencia por celda, filtros, trazas seleccionables y ocultación visual alrededor de inicios/finales.
- Sueño, HRV y pulso en reposo cuando se sincronizan los registros diarios de Garmin.
- Exportación e importación de copias. El modo local utiliza IndexedDB; borrar datos del navegador puede eliminarlo. La exportación contiene datos personales: guárdala fuera de Git.

## Desarrollo

Requisitos: Node.js 24 y npm.

```powershell
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Vite muestra la URL y puerto reales. `base: './'` permite servir el build desde `/an-lisis_entrenos/` en Pages.

## GitHub Pages

En Settings → Pages selecciona GitHub Actions como fuente y añade la variable de Actions `PAGES_ENABLED=true`. El workflow `.github/workflows/pages.yml` ejecuta pruebas, compila y publica `dist` al subir a `main` cuando esa variable está activa. Sin ella, valida y genera el artefacto, conservando la publicación desactivada hasta resolver el plan. En pull requests solo comprueba y compila.

Las variables de Actions `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY` configuran automáticamente la conexión pública del build. Para desarrollo local, usa las mismas variables con prefijo `VITE_` en `.env.local`; [`.env.example`](.env.example) contiene el formato. Nunca añadas una clave secreta o `service_role` a variables `VITE_*`.

**El código y los registros de Actions son públicos.** Las actividades, credenciales y archivos personales no se incluyen en Git ni en `dist`. Los datos de entrenamiento se conservan en el navegador o en Supabase con permisos privados. El sincronizador informa de servicios y códigos HTTP sin incluir identificadores de actividades ni fechas en sus errores HTTP.

URL publicada: `https://eduardocvk.github.io/an-lisis_entrenos/`.

## Configurar Supabase

1. Crea o elige un proyecto de Supabase, preferiblemente en una región europea. Revisa el plan y su capacidad antes de importar todo el histórico.
2. Ejecuta **una vez** [supabase/schema.sql](supabase/schema.sql) en SQL Editor. Crea las tablas, políticas RLS, bucket **privado** y políticas de archivos. El archivo es una migración inicial, no un script para repetir sobre una instalación existente.
3. En Authentication crea tu usuario de correo/contraseña y confirma su correo desde el panel si procede. Para uso personal, desactiva altas públicas. La aplicación no registra usuarios ni envía correos de prueba.
4. Abre «Conexión y ajustes» en Rastro. Introduce la URL del proyecto y la clave **publicable** (`sb_publishable_…` o la antigua `anon`), más el correo y contraseña de tu usuario.
5. Los datos de la nube se autorizan en Supabase, con `auth.uid() = user_id`. Una petición anónima no debe poder leer ni modificar actividades o archivos. La clave publicable no es un secreto; las claves secretas y `service_role` nunca deben llegar al navegador.
6. Iniciar sesión cambia a los datos de esa cuenta; no mezcla automáticamente los datos locales. Para trasladarlos: exporta una copia en modo local y vuelve a importarla después de iniciar sesión. Cerrar sesión restaura la biblioteca local.

Las actividades resumidas viven en `activities`; las muestras y vueltas en objetos JSON privados. Los originales descargados de Garmin se conservan como ZIP privados. `daily_health` conserva métricas diarias y respuestas originales; `sync_runs` registra el resultado de cada sincronización.

La primera versión descarga las muestras de las actividades de la biblioteca al abrir la nube para permitir el mapa histórico. Para históricos grandes habrá que incorporar trazas simplificadas y carga de detalle bajo demanda; mide el uso de transferencia antes de contratar capacidad o importar miles de sesiones.

### Comprobar la privacidad antes de introducir datos reales

- Sin sesión, las consultas de las tres tablas no deben devolver datos.
- Con tu sesión, solo se pueden leer/escribir filas cuyo `user_id` sea el tuyo.
- Los objetos del bucket requieren sesión y la primera carpeta debe ser tu UUID.
- Prueba también con un segundo usuario vacío: no debe ver los datos del primero.
- No publiques exportaciones JSON, FIT, GPX, ZIP o credenciales en Pages, commits ni artefactos de Actions.

Estas políticas se entregan como código; hay que ejecutarlas y verificar su comportamiento en el proyecto real de Supabase. No se considera configurado por el mero hecho de tener este archivo.

## Sincronización oficial de Garmin

El histórico encadena automáticamente el siguiente lote cuando queda trabajo y hubo progreso, incluso si alguna consulta diaria falló. Los errores se identifican por servicio y código HTTP; una incidencia no borra las importaciones completadas. Los nuevos detalles se guardan comprimidos con gzip y el lector conserva compatibilidad con los JSON anteriores.

El workflow manual **Comprobar conexión Garmin** valida el secreto `GARMIN_PERSONAL_API_KEY` y el acceso al listado de carreras sin necesitar Supabase. No guarda archivos ni publica tokens o detalles de actividades. La sincronización completa es un workflow distinto y requiere las credenciales de Supabase.

Usa la [Garmin Connect Personal API](https://developer.garmin.com/gc-developer-program/personal/personal-faq). La clave se genera en la web de Garmin Connect. No se utiliza scraping ni la contraseña de Garmin.

En GitHub → Settings → Secrets and variables → Actions configura estos **secrets**:

| Nombre                    | Valor                                                               |
| ------------------------- | ------------------------------------------------------------------- |
| `GARMIN_PERSONAL_API_KEY` | Clave personal creada en Garmin Connect                             |
| `SUPABASE_URL`            | URL del proyecto                                                    |
| `SUPABASE_SECRET_KEY`     | Clave secreta del servidor (`sb_secret_…` o antigua `service_role`) |
| `SUPABASE_USER_ID`        | UUID exacto de tu usuario en Supabase Auth                          |

La clave secreta de Supabase tiene privilegios amplios: queda exclusivamente en los secrets de Actions, nunca en variables `VITE_*`, ajustes del navegador o código cliente. El sincronizador comprueba que existe el usuario de destino antes de escribir. Que el repositorio sea público no convierte los secrets en valores públicos; no los imprimas en los logs.

1. Ejecuta manualmente **Sincronizar Garmin** en Actions.
2. Primera carga: activa `full_history`, con lotes de 100 actividades por defecto. Repite con `full_history=true` hasta completar el histórico. Un límite alcanzado se informa en el resultado. El número puede ajustarse hasta 500 por ejecución.
3. Sin carga completa, se buscan actividades de los últimos 14 días; las ya importadas se omiten. `start_date` permite un periodo explícito. Las ediciones posteriores de actividades ya importadas no se replican automáticamente en esta versión.
4. Se consultan siete días de recuperación por ejecución. Se guardan campos conocidos y la respuesta original; los campos ausentes no se inventan ni borran métricas previamente recogidas.
5. Solo después de comprobarlo, añade la **variable** `GARMIN_SYNC_ENABLED=true` para activar el horario automático (05:17 y 17:17 UTC). El horario de Actions puede sufrir retrasos. Hasta entonces no se hacen consultas programadas.
6. En la aplicación pulsa «Actualizar datos» para leer Supabase. Este botón no lanza una descarga desde Garmin ni almacena una credencial administrativa en el navegador.

El sincronizador usa Node.js y el SDK FIT oficial en ambos entornos para compartir reglas de interpretación. No requiere un servidor encendido ni una instalación de Python. Se reintentan errores HTTP 429/5xx con espera; un error parcial hace fallar el workflow y registra el resultado, conservando las importaciones ya completadas. La clave de Garmin caduca: renuévala en los secrets cuando corresponda.

La disponibilidad del histórico, los permisos de la cuenta y el contenido real de los archivos requieren una comprobación con tus credenciales. No se afirma que VO₂max, Training Readiness u otras métricas propietarias estén expuestas. Los datos de recuperación no vienen en los archivos FIT/GPX de una carrera.

## Interpretación y límites

- FIT usa el tiempo de temporizador de Garmin; GPX usa el tiempo transcurrido entre puntos. No son idénticos si hubo pausas.
- Identidad de una sesión: instante inicial UTC con precisión de segundo. FIT, GPX y sincronización de una misma carrera se agrupan por ese instante; las notas existentes se conservan al reimportar. Dos carreras que empiecen exactamente en el mismo segundo deben revisarse antes de importar.
- Los mejores esfuerzos incluyen el tiempo transcurrido y una interpolación de distancia. No son marcas oficiales ni predicciones de carrera.
- La eficiencia usa velocidad/pulso integrada y excluye pausas y huecos. El cambio entre mitades necesita cinco minutos válidos por mitad. No identifica por sí solo fatiga o deshidratación y no corrige pendientes o temperatura.
- Las zonas iniciales son límites editables de ejemplo, no una prescripción personal. No se calcula una frecuencia máxima a partir de la edad.
- El mapa de frecuencia cuenta una visita por celda y actividad, no el número exacto de pasadas dentro de una sesión. Se interpola la traza para reducir el efecto de la frecuencia GPS. No hay ajuste a la red de calles.
- Ocultar inicios/finales es una opción visual, no una anonimización del archivo. OpenStreetMap sirve el mapa base según su política de uso; no se descargan mapas masivamente.
- No se usa IA para inventar explicaciones ni se prescriben entrenamientos. Las tendencias deben interpretarse con el contexto del diario.

## Verificación

`npm test` cubre fechas, semanas vacías, pausas, zonas, eficiencia, marcas estimadas, cortes GPS, importación FIT real generado en pruebas y copias JSON. Los datos sintéticos quedan exclusivamente en las pruebas. `npm run build` comprueba el bundle de producción.

La conexión real a Supabase, las políticas entre usuarios, el acceso autenticado a Garmin y el despliegue se deben verificar con sus respectivos servicios configurados. No hay secretos ni datos personales incluidos en el repositorio.
