# Autenticación

Fecha: 2026-10-21
Identificador: AUT
Estado de superficie: Existente
Fase de ampliación: F1
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Arquitectura global](../2026-10-21-arquitectura-global.md) · [Contratos](../2026-10-21-contratos-datos-acceso.md) · [Validación](../2026-10-21-validacion-lanzamiento.md)

## Punto de partida y rutas

Rutas relativas al ámbito vigente de la página. Las nuevas son propuestas.

- `/auth`

Fuentes para preparar la implementación:

- [ui/src/pages/Auth.tsx](../../../../ui/src/pages/Auth.tsx)

## Qué mantendremos y por qué

- Modos de despliegue y sesiones existentes.

## Qué cambiaremos y justificación

| Cambio | Justificación |
| --- | --- |
| Conservar un retorno seguro al recorrido solicitado. | El acceso comercial no justifica otro sistema de identidad. |

## Qué añadiremos y justificación

| Incorporación | Justificación |
| --- | --- |
| Añadir mensajes contextuales cuando el destino requiera membresía. | Permite distinguir autenticarse y tener permiso. |

## Datos y contrato de operación

Sesión y return path validado; no aceptar redirecciones arbitrarias.

## Recorrido y estados

Autenticarse → verificar membresía → ir a página permitida.

- Entrar no concede acceso a clientes ni empresas.

## Lista de regresión

Activar esta revisión cuando una entrega cambie la página o uno de sus contratos. Los posibles cambios descritos arriba se evalúan entonces; esta ficha no añade trabajo al piloto por sí sola.

- [ ] Entrar no concede acceso a clientes ni empresas.
- [ ] Los destinos privados no filtran contenido en el login.

## Páginas relacionadas

- [Empresas operadoras](2026-10-21-empresas.md)
- [Aceptar invitación](2026-10-21-invitacion.md)
