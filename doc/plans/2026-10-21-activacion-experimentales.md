# Activación gradual de funciones experimentales (Cosmonido)

Fecha: 2026-10-21. Ruta en la app: **Ajustes → Experimental**.

Los interruptores afectan a toda la instancia, no a una sola organización.
Activa **uno cada vez**, pruébalo uno o dos días y pasa al siguiente. Si algo
falla, sabrás qué lo causó. Todos se pueden apagar sin perder datos salvo que se
indique lo contrario.

Después de cada cambio: recarga con **Ctrl+F5** (hay service worker).

## Estado actual

Ya activados:

- [x] **Interfaz simplificada** (activado por defecto; no lo apagues, los demás dependen de él)
- [x] **Paperclip Runner** (activado por defecto)
- [x] **Decisiones**
- [x] **Chat con agentes**
- [x] **Bandeja combinada + lista de tareas**

## Siguientes, por orden de importancia

### 1. Respuestas rápidas experimentales

- [ ] Activado
- **Qué hace:** el agente responde con un acuse breve mientras empieza a
  trabajar. Muestra "Conexiones" en los ajustes de la organización.
- **Por qué ahora:** complementa el Chat con agentes; la espera se nota menos.
- **Comprobar:** al escribir en el chat llega un "recibido" antes del resultado.

### 2. Resúmenes

- [ ] Activado
- **Qué hace:** estado generado automáticamente en proyectos y espacios de
  trabajo, con historial.
- **Por qué:** ves de un vistazo cómo va cada proyecto sin abrir tareas.
- **Coste:** genera texto con un agente, así que consume tokens. Vigila Costes.
- **Comprobar:** en la página de un proyecto aparece el bloque de estado y el
  botón de actualizar.

### 3. Tarjetas de estado

- [ ] Activado
- **Requisito:** Resúmenes (se activa solo al encender este).
- **Qué hace:** tablero compartido de tarjetas de estado en `/status`.
- **Ojo:** apagar Resúmenes apaga también Tarjetas de estado.
- **Comprobar:** aparece "Status" (beta) en la barra lateral.

### 4. Casos

- [ ] Activado
- **Qué hace:** productos de trabajo duraderos (entradas de blog, hilos,
  campañas) que varias tareas van mejorando. Añade la pestaña Casos y su API.
- **Por qué:** encaja con una empresa digital que produce contenido de forma
  continua.
- **Comprobar:** aparece "Casos" en el grupo Trabajo; un agente puede crear uno.

### 5. Objetos externos

- [ ] Activado
- **Qué hace:** detecta enlaces en las tareas (pull requests, tickets) y
  muestra su estado.
- **Riesgo:** muy bajo.
- **Comprobar:** pega un enlace de GitHub en una tarea y mira si muestra su estado.

### 6. Agentes integrados

- [ ] Activado
- **Qué hace:** muestra los agentes que gestiona Paperclip (insignias, pestaña
  y controles de configuración).
- **Comprobar:** en Agentes aparece la pestaña de agentes integrados.

### 7. Visor de archivos experimental

- [ ] Activado
- **Qué hace:** en el detalle de una tarea, explorar y previsualizar los
  archivos del espacio de trabajo. No es el explorador de Artefactos.
- **Útil si:** los agentes trabajan sobre código o carpetas.

### 8. Primera tarea: proponer con un documento de plan

- [ ] Activado
- **Qué hace:** en el onboarding, el jefe de gabinete propone un plan breve
  con casillas en vez de una sola tarjeta.
- **Ojo:** solo afecta a organizaciones creadas **después** de activarlo.
- **Comprobar:** crea una organización de prueba.

## Solo cuando haga falta

Activar cuando haya una necesidad concreta, no antes.

| Interruptor | Cuándo activarlo | Requisito |
| --- | --- | --- |
| Espacios de trabajo aislados | Si varios agentes tocan el mismo repositorio a la vez | Proyecto con repositorio git |
| ↳ Aislados por defecto | Después del anterior, si quieres que sea lo normal | Espacios aislados |
| Entornos | Si necesitas ejecutar agentes en entornos distintos | — |
| Conectores de chat | Si quieres hablar con agentes desde Slack, Discord, Teams o Telegram | Cuenta en esa plataforma |
| Bots de revisión de GitHub | Si los agentes deben revisar pull requests | GitHub App |
| Conectores de memoria | Si quieres memoria a largo plazo (Mem0, Zep…) | Cuenta en el proveedor |
| Habilidades beta | Solo para probar versiones nuevas de la habilidad de Paperclip | — |
| Conexiones de asistentes (MCP) | Si quieres usar Claude o Codex desde fuera para delegar trabajo | URL pública con HTTPS y autenticación. Abre acceso desde fuera |
| OpenAI Dot | Si quieres Dot como agente | MCP + HTTPS público |
| Grok Bot | Si quieres Grok como agente | MCP + Runner + HTTPS público |

## No activar

| Interruptor | Motivo |
| --- | --- |
| Interacciones en inglés simplificado | Los agentes escribirían en inglés |
| Interfaz clásica de tareas | Pierde las funciones de chat en las tareas |
| Solo entorno gestionado | Oculta el entorno local; solo para la nube |
| Modo desarrollador (toda la sección) | Herramientas internas de mantenimiento |
| Smoke Lab | Pruebas internas; nunca en despliegue público |

## Registro de pruebas

| Fecha | Interruptor | Resultado | Notas |
| --- | --- | --- | --- |
| 2026-10-21 | Decisiones, Chat con agentes, Bandeja combinada | Pendiente | Activados los tres a la vez |
