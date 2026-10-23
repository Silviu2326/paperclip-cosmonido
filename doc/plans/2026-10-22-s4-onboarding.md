# Contrato del recorrido de onboarding de Sprint 4

Esta nota documenta el contrato compartido del onboarding reanudable de Sprint 4.
La implementación pura vive en
`packages/shared/src/productization/onboarding-journey.ts`.

El plan maestro de producto define el onboarding de autoservicio y sus tres
caminos (emprendedor, agencia y comercial). Atlas amplía el trabajo de
comprensión del negocio: puede proponer oferta, tono y guía de marca a partir
de web o archivos; la persona valida lo inferido y el sistema pide materiales
concretos cuando falten. Este módulo no extrae contenido ni modela todavía el
ciclo de vida de artefactos con fuente, versión y objetivo. Son puntos para
coordinar en una integración posterior, no capacidades ya conectadas.

## Recorrido y contrato

Cada estado lleva versión, ID de cuenta y empresa, camino, fecha de creación y
un `currentStep` solo informativo. El paso siguiente se deriva de las evidencias;
un puntero persistido nunca permite saltarse requisitos.

El orden es: negocio y oferta confirmados por la persona; contexto mínimo;
conexiones requeridas por el guion elegido por el servidor; equipo instalado;
activación explícita; primer encargo iniciado. El guion del servidor aporta los
IDs de conexión necesarios. El módulo no elige proveedores ni inventa
requisitos a partir de texto.

La extracción desde una URL o un archivo solo puede aportar sugerencias de
nombre y oferta. Una sugerencia no es un hecho confirmado y pegar una URL no
confirma la oferta. La confirmación de la persona es un evento independiente.
El contexto mínimo requiere audiencia y resultado deseado; las restricciones
son opcionales.

Los estados de conexión avanzan por `available`, `connected`, `authorized` y
`checked`. Una comprobación requiere evidencia y caduca a las 24 horas. Una
revocación invalida la comprobación previa; hace falta una comprobación nueva
después de reconectar. Tras iniciar el primer encargo, se pueden registrar
revocaciones y comprobaciones nuevas, pero no se borran las marcas históricas
del primer encargo o su entregable. La configuración del camino queda congelada;
un camino distinto requiere otro recorrido. El módulo solo registra hechos
comunicados por servicios propietarios: no conecta, autoriza ni comprueba
proveedores.

Cada hito guarda un snapshot con el conjunto exacto de conexiones requeridas y
su evidencia de comprobación. La validación histórica usa ese snapshot y la
vigencia que tenía al instalar, activar o iniciar el encargo; una reconexión
posterior no reescribe el pasado. Antes del primer encargo, cambiar la oferta o
el contexto invalida el tramo de conexiones y requiere recorrerlo de nuevo.

La instalación requiere negocio, contexto y todas las conexiones vigentes del
guion. La activación exige instalación y evidencia de una acción explícita. El
inicio del encargo requiere activación y conexiones vigentes. La aceptación del
primer entregable es un evento separado, posterior al inicio.

El recorrido se considera completado cuando el primer encargo ha empezado. Esto
no afirma que se haya aceptado un entregable ni valida demanda, pago o retención.
`journeyCompleted` conserva ese hito histórico; `ready` exige además que no haya
bloqueos actuales. Una revocación posterior puede dejar `ready` en falso sin
borrar el hito ni sus tiempos. Ninguno de estos indicadores autoriza ejecución.
Los tiempos hasta el primer encargo y el primer entregable aceptado se calculan
solo con fechas UTC canónicas, evidencias en orden y referencias de eventos
reales. El módulo no puede comprobar que una referencia exista ni que el actor
tuviera autorización.

## Límites e integración posterior

El módulo no hace I/O, persistencia, HTTP, extracción, instalación, activación ni
creación de encargos. Tampoco otorga privilegios al modelo. El servidor deberá
validar en cada operación la identidad autenticada, el ámbito de cuenta/empresa,
la autoridad de la persona y la propiedad y vigencia de las evidencias antes de
guardar hechos o ejecutar efectos. Importar un paquete o aceptar una sugerencia
no concede secretos, contactos, permisos ni autoridad.

La integración deberá coordinarse con los dueños de estos límites, sin replicar
esta lógica:

- el flujo de servidor que crea y reanuda recorridos por cuenta y empresa;
- el catálogo de conexiones y los servicios que aportan comprobaciones reales;
- el catálogo e instalación de equipos y el control de activación de agentes;
- creación de encargos y despacho de heartbeat, conservando aprobaciones,
  presupuestos y controles de ejecución existentes;
- eventos de revisión y aceptación de entregables como fuente de la métrica;
- la UI de selección de camino, reanudación y presentación de bloqueos;
- exportaciones shared y validadores API cuando se acuerden esos límites.

La persona que integre el módulo debe comparar `accountId` y `companyId` con el
ámbito autenticado en servidor. El resultado del reductor distingue eventos
aceptados y rechazados, pero no sustituye esa autorización. La proyección de
progreso ignora `currentStep` y señala estados inválidos o evidencias futuras,
caducadas o fuera de orden.

## Criterios manuales para la integración futura

- Reanudar los tres caminos después de cada etapa y comprobar que el trabajo
  guardado se conserva aunque el puntero de etapa sea incorrecto.
- Registrar una sugerencia extraída y confirmar que ni esta ni su URL satisfacen
  el requisito de confirmación del negocio y la oferta.
- Intentar instalar el equipo antes del contexto y de las conexiones requeridas;
  confirmar que el estado queda bloqueado. Repetir con comprobaciones caducadas.
- Comprobar ámbito de cuenta/empresa, revocación y reconexión; evidencia antigua
  no debe conservar el estado `checked`.
- Confirmar que solo una acción autorizada explícita activa al equipo y que el
  modelo o un paquete no pueden ampliar autoridad.
- Obtener el tiempo del primer encargo de un evento real del servidor y el del
  primer entregable aceptado de una aceptación real. Evidencia inválida,
  extranjera o fuera de orden no produce métricas.
- Separar el encargo iniciado de la validación de demanda, pagos y retención;
  estos resultados requieren evidencia externa de pilotos.
- Medir en los tres pilotos tiempo hasta el primer encargo y el primer
  entregable aceptado, bloqueos, costes y voluntad de pago.

No se ejecutaron pruebas, typecheck, build ni validaciones de runtime por el
alcance asignado. Corresponden a la integración posterior.
