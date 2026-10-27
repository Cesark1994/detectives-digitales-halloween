# 🕵️ Detectives Digitales — Versión Web 2.0

Juego educativo multijugador sobre seguridad digital, pensado para una **computadora organizadora** (se puede proyectar en TV) y **celulares de los participantes**. Implementado con HTML, CSS y JavaScript + servidor **Node.js**, sin dependencias externas en tiempo de ejecución.

## ✅ Qué funciona

- Creación de salas de 1 a 30 participantes; la partida comienza con un mínimo de 1 investigador.
- Código de 4 caracteres y QR generado localmente, sin servicios de terceros.
- Acceso de los celulares mediante navegador, sin instalar apps.
- **Detectar**: elegir varias señales de alerta; límite de 30 segundos.
- **Decidir**: seleccionar la acción correcta; límite de 20 segundos.
- **Mini juegos visuales**: tocar, ordenar y clasificar con emojis; +300 puntos por superar cada reto.
- Sincronización mediante **Server-Sent Events (SSE)**.
- Bloqueo de respuestas ya confirmadas, control del tiempo en el servidor.
- Revelación de respuestas correctas, puntajes, ranking y podio.
- Panel de proyección en pantalla completa.
- Exportación del ranking en CSV.
- Reinicio de partida sin perder los jugadores o cierre de la sala.
- Tres casos iniciales de prueba editables en `casos.json`.

**Puntos:** Detectar = +100 por señal correcta marcada, −100 por señal falsa marcada; Decidir = +500 si acierta, −500 si falla; Mini juego = +300 si supera el reto. No responder no suma ni resta. Los puntajes pueden ser negativos.

## 🧰 Ejecutar en Windows sin Internet durante el juego

**Requisitos:** Windows 10/11 con Node.js 20 o superior instalado previamente, PC y celulares en la misma red Wi-Fi, y permitir el acceso de Node.js al Firewall de Windows en *redes privadas*.

1. Descargar o descomprimir todos los archivos de este proyecto.
2. Doble clic en `INICIAR_JUEGO.bat`.
3. En la PC se abrirá **http://localhost:3000/organizador**.
4. Crear sala y elegir la IP de la red Wi-Fi correcta.
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

Las pruebas cubren: creación e ingreso de jugadores, permisos, selección y bloqueo de respuestas, puntos positivos/negativos, avance de etapas, cierre/reinicio, QR, cabeceras y vencimiento del cronómetro. `GET /healthz` responde al chequeo de alojamiento.

## 📁 Estructura

```text
public/
  index.html        Página para organizador y participantes
  app.js            Interacción cliente y eventos
  estilos.css       Tema visual de detectives / Halloween
  favicon.svg       Ícono
vendor/             Generador QR local y su licencia
casos.json          Contenido educativo editable
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

El diseño se inspira en las etapas **Detectar / Decidir**, ranking y estética Halloween del documento aportado. Los tres casos incluidos son material de demostración; los definitivos deberían ser revisados por el área responsable antes de una actividad institucional.
