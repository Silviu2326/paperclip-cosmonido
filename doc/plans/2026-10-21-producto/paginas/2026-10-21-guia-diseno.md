# Guía del sistema de diseño

Fecha: 2026-10-21
Identificador: DSG
Estado de superficie: Existente
Alcance: Regresión cuando cambie esta superficie

[Plan maestro](../../2026-10-21-plan-maestro-producto.md) · [Regresión](../2026-10-21-regresion-superficies.md)

## Página actual

Ruta: /design-guide. Fuente: [DesignGuide.tsx](../../../../ui/src/pages/DesignGuide.tsx).

## Qué mantendremos y por qué

[DESIGN.md](../../../../DESIGN.md) y los tokens de ui/src/index.css siguen definiendo componentes y valores visuales. Esta página permite consultar patrones; no es un recurso de datos comerciales.

## Qué cambiaremos si una entrega lo necesita

Añadir un patrón compartido cuando una ficha, tabla o formulario nuevo no pueda expresarse con los componentes actuales. La justificación debe indicar qué decisión o estado necesita reconocer el usuario.

## Qué añadiremos si se valida

Ejemplos visuales de un formulario con carga parcial, conflicto de edición y acción externa incierta, cuando existan esos componentes. Así las páginas de negocio usan el mismo significado de estado.

## Ejemplo concreto

Un formulario muestra Cancelar a la izquierda y Guardar a la derecha en la misma fila. Con cambios sin guardar, el error de validación conserva los valores introducidos y permite volver al primer campo erróneo.

## Lista de regresión

- [ ] Los ejemplos usan componentes y tokens compartidos.
- [ ] Los pies de formulario conservan alineación y orden de acciones.
- [ ] Los estados se pueden reconocer con teclado y en pantalla estrecha.
- [ ] Los ejemplos coinciden con los componentes que realmente utiliza la aplicación.

Esta revisión se activa al cambiar el sistema de diseño. La guía no necesita paginación, cliente comercial ni contrato de mutación de negocio.
