# 🕵️ Detectives Digitales — Misiones de seguridad digital

Juego educativo multijugador sobre seguridad digital, pensado para una **computadora organizadora** (se puede proyectar en TV) y **celulares de los participantes**. Implementado con HTML, CSS y JavaScript + servidor **Node.js**, sin dependencias externas en tiempo de ejecución.

El contenido y las consignas están orientados a chicos de **8 a 12 años**, con acompañamiento de una persona adulta. Es una orientación editorial que puede adaptarse al grupo; no supone una certificación por edades.

## ✅ Qué funciona

- Creación de salas de 1 a 30 participantes; la partida comienza con un mínimo de 1 investigador.
- Código de 4 caracteres y QR generado localmente, sin servicios de terceros.
- Acceso de los celulares mediante navegador, sin instalar apps.
- Partidas de **3, 6 o 9 casos**, elegidas al crear la sala.
- **Detectar**: elegir varias señales de alerta.
- **Decidir**: seleccionar una acción segura.
- **Nueve minijuegos de Halloween, uno distinto por misión**: **Encendé una calabaza** (tocar la opción que ayuda), **Camino embrujado** (ordenar pasos sobre lápidas), **¿Dulce o truco?** (deslizar cada carta: dulce = me cuida, truco = atención), **Llená tu calabaza** (seleccionar las ideas que cuidan), **Cazafantasmas** (atrapar los datos privados que asoman por las ventanas de una casa embrujada), **Bola de cristal** (conectar situaciones con acciones), **Linterna detective** (iluminar una habitación oscura y marcar permisos sospechosos), **Poción anti-rumores** (echar los pasos al caldero en orden) y **Defendé tu cuenta** (frenar a fantasmas, murciélagos y vampiros con cartas de la mano). +300 puntos por superar cada reto.
- **Recompensas de juego móvil con temática de Halloween**: los puntos se muestran como dulces 🍬, cada misión y minijuego se presenta con murciélagos, hay racha 🔥 de aciertos, tres calabazas 🎃 que se encienden por misión y una calabaza sorpresa con una carta de superpoder cuya rareza depende de las calabazas. Al final, cada chico ve su colección de cartas. Fondo con luna, murciélagos y telarañas. Sonidos cortos de Halloween y vibración opcionales (se apagan desde la sala de espera).
- **Ritmo tranquilo** para dar más tiempo de lectura y **ritmo clásico** para partidas más rápidas.
- **Pantalla del organizador como programa de juegos de Halloween**, pensada para proyector o televisor: noche con luna y murciélagos, letra grande, el código de sala en fichas y un QR grande, la historia contada por el búho, la carta que se gana en cada misión, un reloj grande y los avatares del equipo que se encienden a medida que cada chico responde (solo muestra quién respondió, nunca qué). Cada etapa de la partida entra completa en 1366×768 y en 1920×1080 sin desplazarse.
- Interfaz móvil infantil con historias de pocas líneas, tarjetas de hasta seis palabras y una tarea por pantalla. Clasificar y conectar avanzan de a una tarjeta con **Atrás / Siguiente / Enviar**; en clasificar, la carta también se puede deslizar y la siguiente llega sola.
- Lectura opcional con un botón **Escuchar / Parar** cuando el navegador la admite. Resultados breves y soluciones completas desplegables.
- Sincronización mediante **Server-Sent Events (SSE)**.
- Bloqueo de respuestas ya confirmadas, control del tiempo en el servidor.
- Revelación de respuestas correctas, puntajes, ranking y podio.
- Panel de proyección en pantalla completa.
- Exportación del ranking en CSV.
- Reinicio de partida sin perder los jugadores o cierre de la sala.
- Nueve casos de demostración editables en `casos.json`: privacidad e imagen, contraseñas, permisos de aplicaciones, enlaces inesperados, premios engañosos, rumores y convivencia digital.

| Ritmo | Detectar | Decidir | Minijuego |
| --- | --- | --- | --- |
| Tranquilo | 45 segundos | 30 segundos | 60 segundos |
| Clásico | 30 segundos | 20 segundos | 35 segundos |

La lectura en voz alta depende de las voces y capacidades del dispositivo; no amplía ni detiene el cronómetro. El organizador puede esperar en las pantallas de resultados para conversar con el grupo antes de avanzar.

**Puntos:** Detectar = +100 por señal correcta marcada, −100 por señal falsa marcada; Decidir = +500 si acierta, −500 si falla; Mini juego = +300 si supera el reto. No responder no suma ni resta. Los puntajes pueden ser negativos.

## 🧰 Ejecutar en Windows sin Internet durante el juego

**Requisitos:** Windows 10/11 con Node.js 20 o superior instalado previamente, PC y celulares en la misma red Wi-Fi, y permitir el acceso de Node.js al Firewall de Windows en *redes privadas*.

1. Descargar o descomprimir todos los archivos de este proyecto.
2. Doble clic en `INICIAR_JUEGO.bat`.
3. En la PC se abrirá **http://localhost:3000/organizador**.
4. Elegir cantidad de casos, ritmo y cupo. Crear sala y elegir la IP de la red Wi-Fi correcta.
5. Escanear el QR en cada celular, elegir apodo y avatar.
6. Iniciar desde la PC y avanzar por los casos.

En modo local no se necesita Internet durante la partida, solamente una red Wi-Fi que permita comunicación entre dispositivos. Si el router aísla clientes, se deben cambiar sus ajustes o utilizar otro punto de acceso.

**Uso en otros sistemas:** abrir una terminal en la carpeta y ejecutar `npm start`.

## 🌍 Publicar desde GitHub con Render

**IMPORTANTE:** [GitHub Pages](https://docs.github.com/es/pages/getting-started-with-github-pages/what-is-github-pages) solo hospeda archivos estáticos. Este juego requiere un servidor Node.js para conectar salas y teléfonos; el repositorio debe desplegarse como **Web Service**, no como sitio estático.

1. Crear un repositorio en [GitHub](https://github.com/new), por ejemplo `detectives-digitales`.
2. Subir **todo el contenido de esta carpeta a la raíz del repositorio** (no el ZIP sin descomprimir). Deben quedar `server.js`, `package.json`, `render.yaml`, `public/`, `vendor/` y `casos.json` en su ubicación.
3. Entrar a [Render](https://dashboard.render.com/) y vincular la cuenta de GitHub.
4. Opción A, rápida: **New > Blueprint** y elegir el repositorio. Render detectará `render.yaml`, que crea un **Web Service Node** (plan Free de prueba).
5. Opción B, manual: **New > Web Service**, conectar el repositorio y completar:
   - Language / Runtime: `Node`
   - Build Command: `npm install --ignore-scripts`
   - Start Command: `npm start`
   - Health Check Path: `/healthz`
   - Plan: `Free` para ensayos, una instancia paga para actividades en producción.
6. Render mostrará una URL del estilo `https://TU-SERVICIO.onrender.com` (la URL definitiva se obtiene **después de desplegar**).
7. El organizador abre `https://TU-SERVICIO.onrender.com/organizador`. Los celulares ingresan con el QR que aparece. **En modo web se requiere Internet** en computadora y celulares, aunque no estén en el mismo Wi-Fi.

**NO activar GitHub Pages** para alojar esta versión multijugador. Basta con subir el código a GitHub y enlazar el repositorio con Render.

### Actualizar un juego que ya está publicado en Render

1. Terminá las partidas activas y descargá los rankings que quieras conservar: un nuevo despliegue reinicia el servidor y elimina las salas en memoria.
2. En tu repositorio de GitHub, actualizá los archivos de esta carpeta conservando sus rutas. Incluí `server.js`, `casos.json` y los archivos de `public/`; subí también las pruebas y la documentación actualizada.
3. Guardá los cambios en la rama conectada a Render, normalmente `main`.
4. Si el servicio tiene despliegue automático, Render comenzará una nueva publicación. Si está desactivado, abrí el servicio en Render y elegí **Manual Deploy > Deploy latest commit**.
5. Esperá el estado **Live** y abrí la misma URL pública terminada en `/organizador`.
6. Creá una sala nueva y comprobá la selección de casos, el ritmo y el ingreso de un celular antes de compartir la actualización con el cliente.

Los cambios de la carpeta local se publican cuando se actualiza el repositorio conectado y Render completa el despliegue. Editar estos archivos en la computadora no cambia por sí solo el juego publicado.

## ⚠️ Limitaciones para uso de producción

- **Las salas, nombres y resultados están en memoria RAM.** Si se reinicia, suspende o actualiza el servidor se pierde la partida. La exportación CSV es el único respaldo manual del ranking.
- **Render Free no es apto para jornadas críticas:** puede suspenderse tras inactividad y reiniciarse, interrumpiendo sesiones. Para un evento importante se recomienda un servicio de pago siempre activo y hacer una prueba de carga con la cantidad de teléfonos prevista.
- **No existe un sistema de cuentas de organizadores**, auditoría histórica ni base de datos persistente; cada sala tiene un token secreto de control. El panel es accesible a cualquiera para crear *su propia* sala (con limitación de frecuencia).
- **Solo una instancia de servidor:** no escalar horizontalmente sin agregar un almacén de sesiones compartido y coordinación de eventos.
- **Privacidad:** para actividades con menores usá apodos, evitá información personal y no incluyas situaciones reales identificables. No se usan analíticas de terceros.
- No distribuir capturas que revelen enlaces privados de administración. No guardar tokens de salas en el repositorio.
- Antes de un uso institucional permanente conviene agregar **autenticación, persistencia PostgreSQL y monitoreo**.

## 🔐 Controles implementados

- El organizador controla su sala mediante un token criptográficamente aleatorio (no por el código de sala).
- Verificación de permisos en acciones y respuestas; origen HTTP para cambios de estado.
- Validación de entradas, límite de tamaño del cuerpo y restricciones de frecuencia para crear salas e ingresar.
- SSE autentificado, respuestas confirmadas inmutables, tiempos controlados por servidor.
- Cabeceras básicas de seguridad (CSP, referrer, protección contra marcos).
- Cierre de salas sin actividad prolongada; límite de salas activas.

No sustituyen una revisión de seguridad formal ni un sistema de inicio de sesión institucional.

## 🧪 Pruebas automatizadas

```bash
npm run check
npm test
```

Las pruebas cubren: creación e ingreso de jugadores, quién respondió cada etapa, permisos, selección y bloqueo de respuestas, puntos positivos/negativos, avance de etapas, cierre/reinicio, QR, cabeceras y vencimiento del cronómetro. `GET /healthz` responde al chequeo de alojamiento. `GET /api/catalogo` informa la cantidad de casos, los tipos de minijuego y los ritmos disponibles sin incluir soluciones.

## 📁 Estructura

```text
public/
  index.html        Página para organizador y participantes
  app.js            Interacción cliente y eventos
  estilos.css       Tema visual de detectives / Halloween
  infantil.css      Pantallas breves para los participantes en celular
  organizador.css   Pantalla grande del organizador (proyector o TV)
  favicon.svg       Ícono
vendor/             Generador QR local y su licencia
casos.json          Contenido educativo editable
FUENTES_EDUCATIVAS.md  Referencias y criterios del contenido
MANUAL_CLIENTE.md    Instrucciones para organizar y jugar
server.js           Servidor HTTP + lógica de las partidas
render.yaml         Configuración para Render Blueprint
INICIAR_JUEGO.bat   Inicio en Windows
package.json        Comandos y versión mínima de Node
package-lock.json   Metadatos reproducibles
.github/workflows/   Pruebas CI al publicar código
tests/              Pruebas integradas
```

## 📝 Editar los casos

Modificar el archivo `casos.json` conservando la estructura, IDs únicos, la opción correcta y los datos del mini juego. Antes de publicarlo, validar que sea JSON correcto con un editor como VS Code. **No incorporar información de menores reales.**

## 👥 Alcance del material original

El diseño conserva las etapas **Detectar / Decidir**, el ranking y la temática Halloween. Los nueve casos son material de demostración y deben ser revisados por el área responsable antes de una actividad institucional. Las referencias educativas y los criterios de adaptación se encuentran en `FUENTES_EDUCATIVAS.md`.
