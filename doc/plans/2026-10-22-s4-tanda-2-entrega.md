# Sprint 4: entrega de la segunda tanda

Fecha: 2026-10-22. Estado: código local nuevo y compuesto; montaje y verificación pendientes.

Continúa la [revisión de siguientes paquetes](2026-10-22-s4-siguientes-paquetes.md): catálogo portable, contratación y onboarding. El trabajo se repartió entre tres subagentes GPT-6 Luna, con archivos exclusivos, y el agente principal compuso la superficie de integración y revisó el código fuente.

## Resultado concreto

| Paquete | Código | Qué hace esta tanda | Qué sigue pendiente |
| --- | --- | --- | --- |
| Catálogo | [Servicio](../../server/src/services/productization/portable-package-preview.ts), [router](../../server/src/routes/productization-catalog.ts), [panel](../../ui/src/features/productization/catalog/PortablePackagePreviewPanel.tsx), [cliente API](../../ui/src/features/productization/catalog/api.ts) | Valida un paquete, resuelve requisitos del catálogo local y adapta perfiles persistentes al preview real de `companyPortabilityService`; presenta plan, incompatibilidades y selección de perfil | Montar router/superficie, verificación del preview, instalación separada y soporte de las secciones aún incompatibles |
| Contratación | [Adaptador](../../packages/shared/src/productization/profile-hire.ts), [panel](../../ui/src/features/productization/hiring/ProfileHirePanel.tsx), [export local](../../ui/src/features/productization/hiring/index.ts) | Convierte un perfil persistente y opciones humanas al contrato existente; usa `agentsApi.hire`, muestra la respuesta real y pide aceptación explícita de skills omitidas | Integración, instrucciones específicas del perfil, especialistas temporales e idempotencia/reconciliación durable para solicitudes board |
| Onboarding | [Panel](../../ui/src/features/productization/onboarding/ProductOnboardingPanel.tsx) | Consume el progreso del recorrido; permite confirmar oferta/contexto, registrar URL como sugerencia y mostrar conexiones e hitos reales | Host con cuenta/recorrido, persistencia y evidencias de servidor; configuración de conexiones, instalación/activación y primer encargo por los servicios propietarios |
| Composición | [ProductizationWorkbench](../../ui/src/features/productization/ProductizationWorkbench.tsx) | Une catálogo → perfil seleccionado → contratación y ofrece el panel de primer encargo cuando recibe un recorrido real de la misma empresa | Registro en una ruta cuando el integrador esté disponible; callbacks reales de onboarding |

Los documentos de cada paquete explican sus interfaces y límites: [catálogo](2026-10-22-s4-tanda-2-catalogo.md), [contratación](2026-10-22-s4-tanda-2-contratacion.md) y [onboarding](2026-10-22-s4-tanda-2-onboarding.md).

La diferencia con el primer adelanto es que ahora hay consumidores de los contratos y llamadas a servicios/API existentes. Eso no significa que haya una ruta accesible en la aplicación actual: no se han modificado `server/src/app.ts`, `ui/src/App.tsx` ni Sidebar.

## Convivencia con los otros sprints

Se han creado exclusivamente archivos nuevos. No se han editado los cinco módulos previos del adelanto, catálogos existentes, contratos de S1–3, esquema, migraciones, manifiestos de paquetes, dependencias, índices compartidos, traducciones globales, motor de ejecución ni estudio de medios.

El catálogo posee sus cuatro archivos de implementación y su documento; contratación posee adaptador/panel/export y su documento; onboarding posee panel y su documento. El agente principal posee Workbench, el ejemplo y esta entrega. La revisión final ajustó archivos de esta misma tanda una vez terminada su responsabilidad delegada.

El cambio de empresa remonta la composición para no conservar selección/formularios de otra empresa. Cambiar de pestaña conserva los paneles montados: no se pierde una solicitud de contratación por navegar al catálogo. Las lecturas de archivo y preview descartan respuestas obsoletas; las mutaciones de contratación capturan el ámbito de la solicitud y no entregan un resultado tardío a otro perfil/empresa.

## Detalles y límites que no deben perderse

- El preview admite JSON de hasta 1 MiB y un máximo de 100 perfiles persistentes en el plan; informa explícitamente de los omitidos y de las secciones no soportadas. Los IDs de perfil se acompañan de `teamId`, porque son locales a cada equipo. Los slugs del borrador son únicos y se usan consistentemente en archivos y jerarquía.
- Se utiliza `companyPortabilityService.previewImport` con archivos inline, sin fuentes remotas, instalación ni activación. La variante de preview de equipos existente tiene otros efectos, incluida auditoría/preparación de skills; esta tanda no la invoca. La revisión de fuente identifica el trabajo previsto; no se ha ejecutado el servicio para demostrarlo.
- Una skill resuelta en el catálogo no equivale a una skill instalada o adjunta. Contratación solo adjunta las referencias que coincidan con el inventario de la empresa y las capacidades declaradas del adaptador; el resto se muestra para resolución u omisión explícita.
- Las secciones de playbooks, formularios, presets, plantillas de encargo, reuniones y conexiones no se convierten en una instalación completa. Un perfil seleccionado no instala el paquete. El coste sugerido no se aplica como presupuesto.
- La contratación usa la política actual de la empresa: puede devolver `pending_approval` o crear el agente en `idle`. No se inicia un encargo desde el panel. Propósito/criterios se muestran para revisión, pero no se convierten en instrucciones de ejecución del agente en este corte.
- Se bloquean dobles envíos locales y reintentos automáticos. Una respuesta de contratación perdida sigue necesitando reconciliación/idempotencia duraderas del servidor. El bloqueo del formulario no garantiza deduplicación entre recargas, pestañas o procesos.
- Onboarding no fabrica cuenta, empresa, referencias ni fechas de evidencia. El host recibe intenciones humanas y devuelve un recorrido autorizado/persistido. No hay botones que certifiquen conexión, instalación, activación o primer encargo. El progreso histórico y los bloqueos actuales siguen separados.
- Los textos nuevos usan `useTranslation` con valores por defecto en español. Falta incorporar y revisar sus claves en los recursos globales de los idiomas soportados; no se declara traducción completa.

## Cómo integrar cuando estén libres los propietarios

### 1. Montaje del preview en servidor

El router nuevo ya define `POST /companies/:companyId/productization/catalog/preview`. En `server/src/app.ts`, el integrador añade el import y lo monta dentro del router `api`, en el mismo tramo autenticado que las rutas de catálogo existentes:

```ts
import { productizationCatalogRoutes } from "./routes/productization-catalog.js";

api.use(productizationCatalogRoutes(db));
```

La URL resultante es `/api/companies/:companyId/productization/catalog/preview`. El factory aplica acceso de empresa y `agents:create`; no crear un montaje público ni saltar la resolución de actor y los límites del servidor. Esta tanda no ha aplicado ese enganche.

### 2. Montaje de la superficie UI

Importar `ProductizationWorkbench` desde `ui/src/features/productization/ProductizationWorkbench.tsx` en una ruta de empresa acordada con el propietario de `App`. Sus props son:

```ts
{
  companyId: string;
  onboarding: ProductOnboardingPanelProps | null;
  onHireCompleted?: (result: AgentHireResponse) => void;
}
```

El Workbench toma el perfil, paquete y `teamId` del preview y los pasa al panel de contratación. `onHireCompleted` recibe el resultado real y puede invalidar las consultas pertinentes; no debe marcar instalación, activación o primer encargo por haber recibido una respuesta de contratación.

No introducir un ID de cuenta inventado para montar onboarding. Mientras no exista un recorrido con host real, pasar `null` muestra indisponibilidad sin simular progreso. El componente rechaza presentar un recorrido cuya empresa no coincida con `companyId`.

### 3. Host de onboarding y persistencia

No se resuelve añadiendo una ruta: hay que implementar el almacenamiento y los servicios propietarios. Cargar cuenta/empresa/recorrido con autorización y proporcionar:

- `journey`, `nowISOString` y etiquetas legibles de conexiones.
- `onConfirmBusiness` y `onConfirmContext`: validar intención humana, persistir y devolver el recorrido autorizado del mismo ámbito.
- `onSubmitEvent`: en este panel solo se usa para guardar URL como sugerencia; no exponerlo como aceptación arbitraria de eventos privilegiados del navegador.
- `onConfigureConnection`: abrir el flujo existente correspondiente a una conexión requerida y autorizada. Las comprobaciones y revocaciones vuelven como hechos del servicio.
- Actualizaciones de instalación, activación, primer encargo y entregable aceptado desde sus fuentes reales. No derivarlas de una pestaña completada o de la contratación de un perfil.

El host debe conservar orden e idempotencia y no sobrescribir una respuesta reciente con una lectura antigua. `journey.version` identifica el formato del contrato, no una revisión de estado que resuelva concurrencia.

`nowISOString` debe mantenerse actualizado y avanzar junto a las evidencias que devuelve el servidor. Congelar el reloj de la carga inicial produciría falsos rechazos de fechas futuras y no detectaría la caducidad posterior de las comprobaciones.

### 4. Calificación posterior

Antes de habilitar la superficie, resolver el caso de resultado incierto de contratación, actualizar OpenAPI/mapas donde corresponda, incorporar traducciones y validar el recorrido integrado. El aislamiento de archivos permite adelantar código; no sustituye esas obligaciones.

## Material de ejemplo y revisión realizada

[Paquete de ejemplo](2026-10-22-s4-paquete-ejemplo.json): equipo editorial con dos perfiles persistentes, sin contactos, credenciales ni skills externas. Es contenido de muestra para inspeccionar el formato o usarlo posteriormente al cualificar el preview. No se ha enviado a la API, importado, instalado ni utilizado como evidencia de piloto.

Se ha revisado manualmente la fuente, las firmas de los contratos consumidos y la coherencia de las interfaces entre los tres paquetes. Se corrigieron problemas observados de referencias de skills, coincidencia de perfil/equipo, slugs, respuestas tardías, dobles envíos y compatibilidad. Esa lectura no prueba compilación o funcionamiento.

No se han ejecutado tests, typecheck, build, token gates, Storybook, navegador, servidores de desarrollo ni scripts de verificación. La consulta de documentación de componentes mediante CLI falló por permisos del entorno; se consultaron las páginas oficiales de shadcn y los componentes locales, sin instalar ni cambiar dependencias.

No se han hecho commits, push, PR, despliegues, publicaciones ni cambios de rama. El sprint 4 continúa pendiente de integración y aceptación.
