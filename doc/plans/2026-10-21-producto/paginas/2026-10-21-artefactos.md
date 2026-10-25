# Artefactos de entrada y salida

Fecha: 2026-10-21
Identificador: ART
Estado de superficie: Existente con trabajo local reciente
Fase de ampliación: F2
Alcance: Ampliación candidata; seleccionar por piloto

## Estado de implementación (2026-10-22)

La integración local reúne el acceso a contexto y archivos/artefactos y contiene superficies relacionadas con medios. Esto no implica duplicar el almacén, que cada medio tenga versionado común, ni que una referencia de contexto conceda acceso. Quedan por comprobar versiones, permisos, audiencia y asociación con la tarea; véase el [registro de implementación](../../2026-10-22-implementacion-ux-simplificada.md).

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/artifacts`
- `/artifacts/in`
- `/artifacts/in/:folderId`
- `/artifacts/out`
- `/artifacts/out/:node`

Fuentes para preparar la implementación:

- [ui/src/pages/artifacts/ArtifactsExplorer.tsx](../../../../ui/src/pages/artifacts/ArtifactsExplorer.tsx)
- [packages/db/src/schema/company_files.ts](../../../../packages/db/src/schema/company_files.ts)
- [server/src/services/company-files.ts](../../../../server/src/services/company-files.ts)

## Uso en los pilotos

El emprendedor prueba el recorrido actual de esta página durante F1. Sus ampliaciones comerciales pueden hacerse después del ensayo; una corrección se activa por un bloqueo observado.

La agencia utiliza solo alta e identificación del cliente, brief, trabajo y revisión del servicio elegido. Importación masiva, fusión, portal y propuesta comercial se seleccionan aparte.

## Qué mantendremos y por qué

- Explorador Entrada y Salida, archivos de empresa, versiones, lecturas y visores presentes en el árbol de trabajo.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Reconciliar el plan anterior de Artefactos con el código local antes de estimar carencias. | El plan anterior describe huecos que ya tienen trabajo en curso. |
| Añadir relaciones explícitas de cliente, proyecto y compromiso sin duplicar assets. | El mismo documento puede servir a una entrega y conservar una única fuente. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Filtros y rutas desde cliente y proyecto. | Hace localizable el contexto y los resultados. |
| Aceptación de una revisión y promoción a contexto con audiencia conservada. | Permite reutilizar lo aprobado sin exponer datos privados. |

## Datos y contrato de operación

CompanyFiles, versiones, assets, adjuntos y work products existentes. Un directorio llamado Clientes no implementa por sí solo permisos por cliente.

## Ejemplo de pantalla y datos de prueba

Los valores siguientes ilustran el diseño; no son clientes, precios o resultados reales. Los campos finales se cierran con el caso seleccionado.

| Campo o bloque | Ejemplo | Regla visible |
| --- | --- | --- |
| Entrada | brief-v1.md | Contexto aportado por persona autorizada. |
| Salida | oferta-v1.md | Resultado accesible de la tarea. |
| revisión | v2 aceptada | No heredar aceptación entre versiones. |

## Recorrido y estados

Subir contexto a Entrada → usar versión autorizada en trabajo → publicar salida → revisar entrega → consultar evidencia.

- Un archivo sin preview conserva descarga y explicación del límite.
- Un fallo de subida no genera una referencia de entrega válida.

## Tareas

Trabajo de ampliación de esta ficha, activable por el [backlog](../2026-10-21-backlog-fases.md). Su validación no bloquea el uso de la página existente.

| ID | Fase | Entregable | Depende de |
| --- | --- | --- | --- |
| ART.01 | F2 | Inventariar y calificar Entrada y Salida del árbol actual. | G03, G04, G07 |
| ART.02 | F2 | Añadir asociación comercial y aceptación sobre archivos existentes. | ART.01, G14 |
| ART.03 | F2 | Comprobar: La versión utilizada y la entregada se pueden rastrear. Se verifica el trabajo reciente antes de construir otro almacén o visor. | ART.02 |

## Criterios de aceptación

- La versión utilizada y la entregada se pueden rastrear.
- Se verifica el trabajo reciente antes de construir otro almacén o visor.

## Páginas relacionadas

- [Contexto del negocio](2026-10-21-contexto.md)
- [Ficha del cliente](2026-10-21-cliente.md)
- [Detalle de proyecto](2026-10-21-proyecto.md)
- [Detalle de tarea](2026-10-21-tarea.md)
