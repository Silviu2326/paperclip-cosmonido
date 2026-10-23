# Reorganización del sidebar principal

Fecha: 2026-10-22. Rama: `integracion` (`paperclip-int`). Alcance: sólo UI. No cambia rutas, API ni base de datos en las fases 1 y 2.

## Problema

El sidebar streamlined ([Sidebar.tsx](../../ui/src/components/Sidebar.tsx)) muestra unos 43 accesos fijos, más los agentes, los proyectos destacados, las tareas recientes y los plugins. La causa principal es la sección **Negocio**, que tiene 30 filas planas sin plegar. Cada página nueva de S1–S4 se ha añadido como fila propia.

Problemas concretos:

1. **Negocio mezcla cinco cosas distintas:** CRM, ventas, medios, ajustes de cuenta y canales. Nada indica dónde empieza cada una.
2. **Hay ajustes en la navegación diaria.** Cuentas y empresas, Facturación, Notificaciones, Seguridad, Idioma, API y webhooks, Canales, Chat web y Sincronización CRM se configuran una vez, pero ocupan filas permanentes. Ajustes ya tiene su propia barra lateral contextual ([CompanySettingsSidebar.tsx](../../ui/src/components/CompanySettingsSidebar.tsx)), que no se está usando para ellas.
3. **Hay páginas hermanas en filas separadas:** Plantillas de vídeo y Cola de medios; Catálogo y Catálogo público (separadas por 20 filas); Leads y Formularios de leads; Contactos e Importar contactos.
4. **Hay flujos puntuales tratados como destinos.** Puesta en marcha y Crear equipo se usan al empezar, no cada día.
5. **Hay iconos repetidos:**
   - `Package` en 5 filas: Artefactos, Catálogo, Plantillas de vídeo, Cola de medios y Catálogo público
   - `Briefcase` en 3: Puesta en marcha, Cuentas y empresas y Agencia
   - `Inbox` en 3: Bandeja, Notificaciones y Conversaciones
   - Por parejas: `Users`, `UserPlus`, `RefreshCw`, `ShieldCheck`, `Globe`, `Radio`, `FolderOpen` y `Target`
6. **El estado plegado no se guarda.** `SidebarSection` sólo guarda el estado en memoria, así que al recargar todo vuelve a abrirse.
7. **La paleta (Cmd/Ctrl+K) no conoce las páginas nuevas.** [CommandPalette.tsx](../../ui/src/components/CommandPalette.tsx) sólo lista Inicio, Bandeja, Tareas, Proyectos, Objetivos, Agentes, Costes y Actividad. Si se esconden filas sin añadirlas antes a la paleta, se pierden.

## Principios

- **Cada dominio, un grupo con nombre.** Ningún grupo pasa de unas 7 filas.
- **Ajustes, en Ajustes.** Lo que se configura una vez sale del sidebar.
- **Páginas hermanas, en pestañas.** Una fila por dominio y pestañas dentro de la página.
- **Divulgación progresiva.** Los grupos secundarios empiezan plegados, se abren solos cuando la ruta activa está dentro (ya se hace así con Administración) y recuerdan el estado.
- **Nada inalcanzable.** Toda página que salga del sidebar tiene que poder abrirse desde la paleta y desde un enlace en su página padre.
- **No se rompen URLs.** Las rutas existentes siguen funcionando: se reubica la entrada, no la ruta.

## Propuesta de arquitectura

| Grupo | Filas | Estado inicial |
|---|---|---|
| (superior) | Buscar, Inicio, Bandeja (o Tareas combinadas) | — |
| **Trabajo** | Chat, Tareas, Proyectos (+ destacados), Rutinas, Encargos, Artefactos | abierto |
| **Clientes** | Clientes, Contactos, Leads, Oportunidades, Conversaciones, Agenda | plegado |
| **Ventas** | Propuestas, Acuerdos de servicio, Playbooks, Resultados | plegado |
| **Estudio** | Medios (pestañas: Plantillas · Cola), Catálogo (pestañas: Privado · Público) | plegado |
| **Equipo** | agentes, Oficina, Autonomía | abierto |
| **Administración** | Skills, Conectores, Auditoría | plegado |

En total quedan **24 accesos fijos**, pero con los grupos plegados por defecto se ven **unos 15**.

Destino de las filas que salen:

| Fila actual | Destino | Cómo se llega |
|---|---|---|
| Contexto | Ajustes de empresa → «Contexto del negocio» | barra de Ajustes, paleta, tarjeta en Inicio si está vacío |
| Puesta en marcha | Tarjeta-checklist en Inicio mientras no esté completa | Inicio, paleta |
| Crear equipo | Acción «Crear equipo» en el grupo Equipo, junto a «Nuevo agente» | Equipo, paleta |
| Agencia | Sólo visible para cuentas de tipo agencia (ver decisión D2) | Equipo o menú de empresa |
| Plantillas de vídeo, Cola de medios | Una fila «Medios» con pestañas | Estudio |
| Catálogo público | Pestaña de «Catálogo» | Estudio |
| Formularios de leads | Pestaña de «Leads» | Leads |
| Importar contactos | Botón «Importar» en Contactos | Contactos |
| Llamadas CRM | Pestaña de «Conversaciones» | Conversaciones |
| Sincronización CRM | Ajustes de empresa → Integraciones | Ajustes |
| Canales, Chat web, API y webhooks | Ajustes de empresa → Canales / Desarrolladores | Ajustes |
| Cuentas y empresas, Facturación de Paperclip | Ajustes → Cuenta y facturación | Ajustes, menú de cuenta |
| Notificaciones, Seguridad, Idioma | Preferencias personales (junto a `company/settings/instance/profile`) | menú de cuenta |

## Iconos únicos

Cada fila visible tiene un icono propio. Propuesta (lucide-react):

| Fila | Icono |
|---|---|
| Artefactos | `Package` |
| Contexto | `BookMarked` |
| Encargos | `ClipboardList` (Objetivos conserva `Target`) |
| Clientes | `Building2` |
| Contactos | `UserRound` |
| Leads | `UserPlus` |
| Oportunidades | `Handshake` |
| Conversaciones | `MessagesSquare` (si Sala de reuniones está activa, pasa a `Presentation`) |
| Agenda | `CalendarDays` |
| Propuestas | `FileSignature` |
| Acuerdos de servicio | `FileCheck` |
| Playbooks | `BookOpen` |
| Resultados | `TrendingUp` |
| Medios | `Clapperboard` |
| Catálogo | `Store` |
| Oficina | `Armchair` |
| Autonomía | `Gauge` |

## Fases

### Fase 1 — Agrupar y ordenar (sólo `Sidebar.tsx` y la paleta; riesgo bajo)

1. Añadir a la paleta todas las páginas del sidebar actual, agrupadas igual que en la tabla de arquitectura. **Esto va primero** para que nada quede inalcanzable.
2. Partir Negocio en Clientes, Ventas y Estudio, con `collapsible`. Abrir el grupo automáticamente cuando la ruta activa le pertenezca: generalizar `ADMIN_ROUTE_PATTERN` a un mapa grupo → rutas.
3. Guardar el estado abierto/plegado por grupo en `localStorage`, con try/catch y empezando plegado si falla. La clave va por usuario y empresa.
4. Aplicar los iconos únicos.
5. Mover Oficina y Autonomía al grupo Equipo.
6. Claves i18n nuevas (`nav.groupCustomers`, `nav.groupSales`, `nav.groupStudio`) en ES/EN/PT.

En esta fase todavía no sale ninguna fila del sidebar: sólo se ordena. El efecto ya es grande, porque con los grupos plegados se ven unas 20 filas.

### Fase 2 — Sacar ajustes y fusionar páginas hermanas

1. Ampliar `classifyShellRoute` ([shell-navigation.ts](../../ui/src/lib/shell-navigation.ts)) para que `/product-accounts`, `/product-billing`, `/public-api`, `/channels-settings`, `/webchat-settings`, `/crm-sync` y `/context` cuenten como superficie `settings`. Así se abren con la barra de Ajustes sin cambiar la URL.
2. Añadirlas a `CompanySettingsSidebar` en tres bloques: Negocio (Contexto), Canales (Canales, Chat web), Integraciones (Sincronización CRM, API y webhooks), y Cuenta (Cuentas y empresas, Facturación).
3. Preferencias personales (Notificaciones, Seguridad, Idioma): enlazarlas desde el menú de cuenta ([SidebarAccountMenu.tsx](../../ui/src/components/SidebarAccountMenu.tsx)) y agruparlas con el perfil en `company/settings/instance/*`.
4. Pestañas: crear un componente `PageTabs` con `NavLink` a las rutas existentes (sin rutas nuevas). Se usa en Medios (Plantillas · Cola), Catálogo (Privado · Público), Leads (Leads · Formularios) y Conversaciones (Conversaciones · Llamadas). Contactos recibe un botón «Importar».
5. Quitar del sidebar las filas que ya tienen destino.

### Fase 3 — Visibilidad según el negocio (necesita decisión)

1. Puesta en marcha pasa a ser una tarjeta-checklist en Inicio y desaparece al completarse. Requiere leer el estado de productización que ya existe; no se inventa un estado nuevo.
2. Grupos según los módulos que use la empresa. Por ejemplo, ocultar Clientes/Ventas en empresas sin CRM, Estudio sin medios y Agencia salvo en cuentas de agencia. Si no existe ya un ajuste de «módulos activos», esto es un contrato nuevo en db/shared/server/ui y pasa por el flujo normal de cambios de esquema. **No se empieza sin aprobación.**

## Decisiones pendientes

- **D1.** ¿Los nombres de grupo «Clientes», «Ventas» y «Estudio» valen, o preferís otros (por ejemplo «CRM» o «Comercial»)?
- **D2.** ¿Agencia la ven todas las cuentas o sólo las de tipo agencia? ¿Existe ya ese tipo de cuenta en «Cuentas y empresas»?
- **D3.** ¿Se aborda la fase 3 (módulos activos por empresa) o basta con plegar los grupos?
- **D4.** ¿Las preferencias personales viven bajo `company/settings/instance/*` (lo que ya existe) o en una ruta de usuario propia?

## Verificación por fase

- Pruebas: actualizar [Sidebar.test.tsx](../../ui/src/components/Sidebar.test.tsx) (grupos, auto-apertura, persistencia, una fila por ruta), `shell-navigation.test.ts` (nuevas rutas `settings`), `CompanySettingsSidebar.test.tsx` y `CommandPalette.test.tsx`.
- `pnpm check:token-gates` (sin valores sueltos en componentes).
- `pnpm -r typecheck` y `pnpm test:run` limitados a `ui` primero; el chequeo completo antes del PR.
- Revisión manual en escritorio, rail plegado y móvil ([MobileBottomNav.tsx](../../ui/src/components/MobileBottomNav.tsx)), en ES/EN/PT.
- Actualizar las entradas de navegación de [maps/feature-map/productization.md](../../maps/feature-map/productization.md) y ejecutar `node scripts/check-maps.mjs`.

## Riesgos

- **Enlaces internos y pruebas e2e** que buscan filas por texto en el sidebar. Mitigación: buscar `getByRole("link", { name: ... })` en `tests/` antes de quitar filas.
- **Usuarios que ya conocen la posición actual.** Mitigación: la paleta y la auto-apertura del grupo de la ruta activa.
- **Clasificar rutas como `settings`** cambia qué barra se ve. Comprobar que el botón «volver a la app» de `CompanySettingsSidebar` vuelve al origen correcto (`contextualSidebar.origin`).
