# Proyectos

Fecha: 2026-10-21
Identificador: PYS
Estado de superficie: Existente
Fase de ampliación: F2
Alcance: Ampliación candidata; seleccionar por piloto

## Estado de implementación (2026-10-22)

La integración local muestra el cliente como contexto opcional del proyecto. Crear y usar un proyecto interno sin cliente sigue siendo un caso requerido. La persistencia y los límites de acceso por cliente necesitan verificación específica; véase el [registro de implementación](../../2026-10-22-implementacion-ux-simplificada.md).

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/projects`

Fuentes para preparar la implementación:

- [ui/src/pages/Projects.tsx](../../../../ui/src/pages/Projects.tsx)

## Uso en los pilotos

El emprendedor prueba el recorrido actual de esta página durante F1. Sus ampliaciones comerciales pueden hacerse después del ensayo; una corrección se activa por un bloqueo observado.

La agencia utiliza solo alta e identificación del cliente, brief, trabajo y revisión del servicio elegido. Importación masiva, fusión, portal y propuesta comercial se seleccionan aparte.

## Qué mantendremos y por qué

- Colección, estados, privacidad y vínculo de proyectos con objetivos.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Distinguir iniciativas internas y encargos de clientes. | Los tres caminos comparten ejecución pero no el mismo origen. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Filtros por cliente, oferta y compromiso y próxima entrega. | Permite gestionar cartera de trabajo. |
| Creación contextual desde cliente o acuerdo. | Evita perder procedencia y duplicar proyectos. |

## Datos y contrato de operación

Projects existentes; cliente es opcional y el acuerdo de origen no altera acceso. Mantener varios repositorios y proyectos sin repositorio.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| nombre | Paquete Demo de contenidos | Encargo de agencia. |
| cliente | Cliente Demo A | Opcional para iniciativas internas. |
| origen | brief-v1.md | Alcance revisable antes de ejecutar. |

## Recorrido y estados

Crear iniciativa o encargo → revisar alcance y acceso → abrir proyecto.

- Un proyecto archivado conserva entregas e historial.
- Un acuerdo convertido dos veces recupera el proyecto o transferencia ya registrada.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| PYS.01 | F2 | Definir colección de proyectos con origen y filtros comerciales. | G03, G04, G07 |
| PYS.02 | F2 | Construir creación contextual y vistas de cartera. | PYS.01, G14 |
| PYS.03 | F2 | Comprobar: Un fundador crea una iniciativa sin cliente ni oportunidad. Una agencia lista proyectos por cliente sin mezclar contenido privado. | PYS.02 |

## Criterios de aceptación

- Un fundador crea una iniciativa sin cliente ni oportunidad.
- Una agencia lista proyectos por cliente sin mezclar contenido privado.

## Páginas relacionadas

- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Clientes](2026-10-21-clientes.md)
- [Objetivos](2026-10-21-objetivos.md)
- [Ficha de la oportunidad](2026-10-21-oportunidad.md)
