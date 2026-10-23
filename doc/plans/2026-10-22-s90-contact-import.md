# Importación inicial de contactos por CSV

Fecha: 2026-10-22. Alcance de fuente S2 B / S4 B. No se ejecutó el recorrido.

Se mantiene la identidad y el servicio de contactos del CRM. Se añade `/<company-prefix>/contact-import`, accesible desde Negocio, para revisar un CSV antes de crear datos. No se fusionan contactos ni se deduce consentimiento de un archivo importado.

La página admite un archivo o texto, con un máximo de 128 KiB y 100 filas. Permite mapear nombre, correo, teléfono e idioma; el formato predeterminado es `displayName,email,phone,language`. El parser admite comillas CSV, comas escapadas y saltos de línea dentro de campos. La vista previa distingue nuevos, existentes, repetidos dentro del archivo e inválidos. Las identidades ambiguas y filas inválidas impiden confirmar. Los contactos existentes se omiten sin modificarlos.

`POST /companies/:companyId/productization/imports/contacts/preview` no escribe. El resultado lleva una huella del contenido normalizado y de la propiedad actual de las identidades. `…/commit` exige esa huella y una clave UUID estable del lote. Vuelve a resolver las identidades dentro de la transacción; un cambio concurrente devuelve conflicto y obliga a revisar. Un recibo del mismo contenido se devuelve sin recrear contactos. Reutilizar su clave con otro contenido devuelve 409. Cada fila usa el servicio CRM, con publicaciones diferidas hasta el commit exterior. Si otra operación gana una identidad mientras se importa, el lote completo revierte.

`product_contact_imports` guarda la huella y el recibo acotado, sin conservar el CSV. La ruta exige una sesión de usuario board y acceso de escritura a la empresa; la UI liga sus resultados al usuario/empresa actuales, no guarda el CSV en caché persistente y conserva la clave al reintentar tras una respuesta perdida. El cuerpo queda excluido de diagnósticos HTTP.

Fuentes: [contrato](../../packages/shared/src/productization/contact-import.ts), [servicio](../../server/src/services/productization/contact-import.ts), [ruta](../../server/src/routes/productization-contact-import.ts), [página](../../ui/src/pages/ContactImport.tsx), [schema](../../packages/db/src/schema/productization_imports.ts), [migración del corte](../../packages/db/src/migrations/0365_s90_consolidated_productization.sql).

Falta integrar una importación Gmail/HubSpot en el recorrido de onboarding y comprobar el objetivo de menos de veinte minutos. No se afirma que CSV cubra las tres fuentes originales. Quedan por ejecutar casos de CSV citado, dos empresas, identidades ambiguas, carrera con alta manual, respuesta perdida e idempotencia; no se escribieron ni ejecutaron verificaciones para fabricar aceptación.
