# Crear agente

Fecha: 2026-10-21
Identificador: AGN
Estado de superficie: Existente
Fase de ampliación: F4
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/agents/new`

Fuentes para preparar la implementación:

- [ui/src/pages/NewAgent.tsx](../../../../ui/src/pages/NewAgent.tsx)

## Qué mantendremos y por qué

- Adaptadores, configuración, aprobación de contratación cuando aplica y validación existente.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Ofrecer creación guiada por trabajo y capacidades necesarias. | Reduce configuración técnica sin ocultar decisiones relevantes. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Requisitos de contexto, conexiones y presupuesto antes de activar. | Evita agentes creados que no pueden hacer su encargo. |
| Creación idempotente y opción de guardar sin ejecutar. | Facilita probar configuración sin gasto accidental. |

## Datos y contrato de operación

Agent y configuración existente; ninguna plantilla debe copiar credenciales ni ampliar concesiones.

## Recorrido y estados

Elegir capacidad → configurar → comprobar requisitos → guardar → activar solo por acción válida.

- Una aprobación pendiente no aparece como agente ya operativo.
- Un adaptador no disponible propone corregir la configuración sin recrear el registro.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Doble envío crea un solo agente o muestra el ya creado.
- [ ] No se ejecuta trabajo por visitar o guardar un formulario.

## Páginas relacionadas

- [Agentes](2026-10-21-agentes.md)
- [Detalle del agente](2026-10-21-agente.md)
- [Aplicaciones](2026-10-21-apps.md)
- [Adaptadores de agentes](2026-10-21-adaptadores.md)
