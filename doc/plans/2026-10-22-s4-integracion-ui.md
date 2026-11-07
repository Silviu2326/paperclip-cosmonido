# Sprint 4: integración de puesta en marcha en UI

La página `ui/src/pages/Productization.tsx` carga y reanuda el recorrido persistido para la empresa seleccionada. Si el servidor responde que aún no existe, ofrece los recorridos emprendedor, agencia y comercial; el primer guardado usa revisión `0`. La página queda exportada como `Productization`, que ya es el import esperado por `App.tsx` en esta copia. No requiere cambios de ruta, navegación ni traducciones globales.

`ui/src/features/productization/onboarding/api.ts` adapta el cliente HTTP existente a `GET`/`PUT /api/companies/:companyId/productization/onboarding` y las acciones `/events`, `/team`, `/activate` y `/first-job`. Cada escritura envía la revisión observada; un `409` invalida el snapshot de esa empresa. GET y mutaciones devuelven el snapshot completo, incluyendo `serverNow`, agentes elegibles, encargos elegibles y sus indicadores de truncamiento. La caché conserva revisiones mayores si una respuesta vieja llega tarde, y la página mantiene claves separadas por empresa.

El navegador manda solo selecciones e intenciones del usuario. No crea IDs, tiempos, evidencia, miembros, encargos ni estados de aceptación. “Usar este equipo” confirma la selección en el servidor; no arranca agentes, despierta heartbeats ni crea un encargo. “Vincular encargo” acepta únicamente los objetivos elegibles que ofrece el servidor, cuyo issue ya tiene inicio real. El primer entregable aceptado sigue siendo dato derivado del servidor.

El workbench compone la revisión del catálogo, el `ProfileHirePanel` que llama el endpoint de contratación existente, el recorrido y una pestaña de equipo/encargos que consulta agentes y hasta cinco assignments mediante sus API existentes. La consulta del equipo y los assignments solo se activa al abrir esa pestaña; usa `Assignment`, `assignmentStatus` y enlaces propios de Assignments. Al contratar, invalida las consultas acotadas y el snapshot del recorrido de la misma empresa. No se duplica la mutación de contratación.

La lista de agentes y encargos puede estar limitada a 100; la UI presenta el aviso enviado por el servidor. Los perfiles contratados aún sujetos a aprobación no aparecen como agentes listos para elegir. Los cambios de empresa remountan el workbench y las respuestas permanecen en cachés con alcance por empresa.

## Revisión posterior

- Confirmar visualmente las tres opciones iniciales, carga, 404, errores, reanudación y cambio de empresa.
- Verificar en una empresa real la creación con revisión 0 y los conflictos de revisión sin pérdida de los campos que el usuario estaba editando.
- Confirmar que el selector de equipo solo refleja candidatos elegibles del servidor y que la respuesta de contratación refresca candidatos, equipo y assignments.
- Comprobar que “Usar este equipo” no cambia estado de agente ni genera heartbeat o issue; vincular solo un issue realmente iniciado tras esa confirmación.
- Revisar avisos de truncamiento, enlaces a Encargos/agente y estado derivado de entregable aceptado.

No se ejecutaron tests, typecheck, build, checks, servidor de desarrollo ni código de estos módulos, según el alcance de esta tanda.
