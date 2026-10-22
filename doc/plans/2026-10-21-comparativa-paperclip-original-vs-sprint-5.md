# Paperclip original frente a nuestra versión tras el sprint 5

Fecha: 2026-10-21
Estado: comparativa de referencia. La columna "original" describe el repositorio tal como está hoy ([GOAL](../GOAL.md), [PRODUCT](../PRODUCT.md), esquema y rutas). La columna "nuestra versión" describe lo que el [plan maestro](2026-10-21-plan-maestro-producto.md) entrega al cierre del S4 más una o dos apuestas del S5; es un plan, no un hecho, y se revisa cuando cada sprint cierre.

## En una frase

| | Paperclip original | Nuestra versión |
| --- | --- | --- |
| Qué es | El control plane de una empresa de agentes de IA: organigrama, tareas, presupuestos, gobierno y ejecución | El sistema con el que un negocio pequeño opera con agentes: capta, atiende, vende, produce, entrega y cobra, con control humano |
| Para quién | Quien quiera montar una empresa autónoma de agentes y gobernarla | Emprendedores, agencias y equipos comerciales que quieren resultados de negocio, no gestionar agentes |
| Qué vende | Infraestructura: "el sistema operativo de las empresas autónomas" | Resultados: un entregable aceptado, un lead atendido, una propuesta cerrada, un vídeo publicado |
| Quién lo configura | Un operador técnico que define agentes, adaptadores, skills y conexiones | Cualquiera, describiendo lo que quiere; o una agencia que lo implanta en sus clientes |
| Cómo se cobra | No hay cobro: software autoalojado, multiempresa por instancia | Suscripción por cuenta con planes, límites y consumo; señal de clientes por Stripe; agencia implantadora con facturación agregada |

## Lo que se conserva intacto

La versión nueva se construye encima del control plane, no en su lugar. Esto sigue igual y es lo que la hace gobernable:

- Empresa como objeto de primer orden; todo pertenece a una empresa.
- Agentes como empleados con adaptador, rol y jerarquía; organigrama.
- Tareas con asignación única, checkout atómico, bloqueos, padres e hijos, trazabilidad hasta el objetivo.
- Aprobaciones, decisiones, colas de decisión y auditoría.
- Presupuestos con parada automática, eventos de coste, conciliación de proveedores.
- Heartbeats, rutinas, espacios de trabajo, entornos, adaptadores (Claude Code, Codex, Gemini, Cursor, OpenClaw, plugins).
- Archivos de empresa, documentos con revisiones, productos de trabajo, artefactos.
- Conexiones a apps, pasarelas de herramientas, MCP, canales de chat (Slack, Discord, Telegram, Teams, voz).
- Catálogos instalables de equipos y skills; plugins.
- Importación y exportación de empresa; acceso a la instancia; secretos.

## Comparativa por área

| Área | Paperclip original | Nuestra versión tras S5 | Sprint |
| --- | --- | --- | --- |
| **Entrada de trabajo** | Se crea una tarea o un objetivo y se asigna a un agente | Se crea un **encargo**: criterio de aceptación, entregable esperado, presupuesto y contexto; el equipo propone plan antes de gastar | S1 |
| **Resultado** | La tarea pasa a hecha; el producto de trabajo queda adjunto | El entregable tiene **revisión y aceptación** propias, con versión, motivo y evidencia; devolverlo reabre el trabajo; el cliente puede aceptarlo por enlace externo en su nombre | S1, S2 |
| **Contexto para agentes** | Archivos de empresa, documentos, skills y memoria por conexión | **Contexto del negocio** por rol (oferta, marca, procedimientos, clientes) con audiencia y vigencia; **memoria por cliente**; el agente solo recibe lo que corresponde a su encargo y cliente | S1, S2 |
| **Inicio** | Dashboard de actividad, agentes y costes; actividad en vivo | Inicio que responde **qué se hace, para quién, qué necesita de mí, cuánto cuesta**; métricas por camino con fuente y cobertura; comparación con el periodo anterior; resumen diario por WhatsApp | S1, S3, S4 |
| **Clientes y ventas** | No existe. Hay `cases` y `pipelines` genéricos y experimentales | **CRM nativo**: clientes, contactos con identidad entre canales, leads, oportunidades por etapas, actividades, compromisos, catálogo de servicios, propuestas con firma y señal, renovaciones; mismo servicio para persona y agente; sincronización con HubSpot y Pipedrive | S2, S3 |
| **Comunicación con el exterior** | Correo asociado a tareas y conexiones; canales de chat para hablar con agentes | **Bandeja unificada** de correo, WhatsApp, Messenger, Instagram, Telegram, chat web, teléfono y SMS, por contacto y cliente, con SLA, prioridad y estados de entrega reales; respuesta en el idioma del contacto | S2 |
| **Agenda** | No existe (el conector Google tiene scopes de Calendar sin uso de producto) | Disponibilidad, reserva, cambio y cancelación; **enlace público de reserva**; recordatorios por el canal preferido | S2 |
| **Superficie pública** | Ninguna; todo requiere sesión de empresa | `/p/:empresa/...` con marca: formularios, reserva, revisión, propuestas, chat web, portal de cliente; tokens con caducidad y revocación | S2, S4 |
| **Acciones de agentes hacia fuera** | Herramientas de apps con revisión de acciones; permisos por herramienta | **Un gate de autonomía** por acción (`draft_only / send_with_approval / send_direct`); **autonomía ganada** con modo sombra y banco de pruebas; revocación inmediata; "**por qué hizo esto**" por cada acción | S2, S3 |
| **Continuidad** | Rutinas por programación; eventos de conexión | **Playbooks** comerciales versionados; secuencias multicanal por eventos (sin respuesta, reunión, etapa, compromiso); compromisos detectados en conversaciones; transferencia venta → entrega idempotente con traspaso entre agentes | S3 |
| **Decisiones humanas** | Aprobaciones y colas de decisión genéricas | Decisiones comerciales con sujeto, versión y efecto, respondibles desde Inicio, la ficha, el móvil y WhatsApp en un toque | S3, S4 |
| **Medios** | Nada | **Estudio de medios** para agentes: transcripción, cortes, subtítulos, clips, zoom, doblaje, stop motion, variantes por plataforma, presets de marca; **publicación en redes** con calendario y métricas de vuelta | S1 a S4 |
| **Creación de agentes** | Formulario con adaptador, configuración, skills y herramientas | "**¿Qué quieres que haga?**" → rol, skills, herramientas, conexiones, autonomía, presupuesto y playbook propuestos; **entorno de prueba** antes de activar; clonar, versionar, comparar | S4 |
| **Conexiones** | Catálogo amplio con flujos de OAuth y MCP; prueba manual | **Dos clics** con comprobación real; cuatro estados; salud y reconexión guiada; Zapier y Make | S4 |
| **Onboarding** | Semilla con misión, agente y primera tarea; asistente en laboratorio | Pegar la URL del negocio → oferta, marca y tono extraídos → conexiones → equipo → primer encargo en menos de 20 minutos; importación de contactos | S4 |
| **Catálogo** | Equipos y skills incluidos en la app | **Catálogo y marketplace** de paquetes (equipo + skills + playbooks + plantillas + presets) por camino y sector; publicar los propios; con la apuesta S5, pagos entre usuarios | S4, S5 |
| **Configuración** | Pantallas de ajustes, experimentales, herramientas avanzadas | **Copiloto de configuración** por conversación que solo hace lo que el usuario podría hacer a mano | S4 |
| **Cuentas y cobro** | Una instancia, varias empresas; sin cuentas ni planes | **Cuentas con planes, límites y consumo**; suscripción Stripe; `plan-gate` que explica el límite y enlaza a subir de plan | S4 |
| **Agencias** | Una empresa por instancia o varias sin relación | **Agencia implantadora**: varias empresas cliente bajo una cuenta, conexiones propiedad del cliente, consumo por empresa, marca blanca; con la apuesta S5, facturación a sus clientes desde Paperclip | S4, S5 |
| **Móvil** | Interfaz web de escritorio | PWA instalable; push y WhatsApp para decisiones; responder en un toque | S4 |
| **Acceso** | Autenticación, membresías, claves de API para agentes y board | Roles por empresa, segundo factor, sesiones, exportación y borrado de cuenta, retención | S4 |
| **Idiomas** | Interfaz en inglés con i18n | Español, inglés y portugués; agentes en el idioma del contacto | S4 |
| **API** | REST `/api` interna, OpenAPI, MCP público | **API pública versionada** con claves por alcance y **webhooks** de eventos de negocio | S4 |
| **Economía** | Costes de ejecución, suscripciones de IA, presupuestos | Costes por encargo y por cliente, señales cobradas, previsión marcada como estimación; con la apuesta S5, facturación propia, cobros y margen real | S1 a S5 |
| **Aprendizaje** | Ejemplos de entrenamiento de decisiones (experimental) | Modo sombra y banco de pruebas; con la apuesta S5, agentes que aprenden de qué convierte y qué se acepta a la primera, y proponen cambios al playbook | S3, S5 |

## Lo que cambia de verdad

1. **El sujeto.** Original: el agente y su tarea. Nuestra versión: el cliente, el encargo y el resultado. Los agentes siguen ahí, pero el usuario no los gestiona; les pide cosas.
2. **La frontera.** Original: la empresa y sus agentes, sin exterior. Nuestra versión: contactos, conversaciones, reservas, revisiones y pagos de gente que no tiene cuenta, con una superficie pública y un gate único para todo lo que sale.
3. **La autonomía.** Original: permisos por herramienta y revisión de acciones. Nuestra versión: autonomía por acción que se gana con evidencia, se explica y se revoca al instante.
4. **El producto.** Original: software que se instala. Nuestra versión: servicio que se contrata, con alta, plan, consumo y cobro, y que una agencia puede revender implantándolo.
5. **Los medios.** Original: nada. Nuestra versión: un estudio propio que los agentes usan para producir y publicar vídeo.

## Lo que no cambia y conviene recordar

- Nada de lo nuevo amplía autoridad por la puerta de atrás: un contacto nunca es principal, un mensaje nunca es una orden, un paquete nunca trae secretos ni permisos, el copiloto solo hace lo que el usuario podría hacer.
- Borrador, enviado, entregado, aceptado y cobrado siguen siendo hechos distintos.
- Los invariantes del control plane (asignación única, checkout, aprobaciones, parada por presupuesto, auditoría) se reutilizan en cada capa nueva; no se duplican.

## Cómo leer esta comparativa

La columna original es verificable hoy en el repositorio. La columna nuestra se verifica sprint a sprint con las demos de cierre del plan maestro; lo marcado como apuesta S5 depende del informe de los pilotos externos del S4 y puede no entrar. Cuando un sprint cierre, actualizar esta tabla con lo que de verdad quedó construido.
