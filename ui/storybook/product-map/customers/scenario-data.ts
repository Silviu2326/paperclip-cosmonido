import type { DemoContact, DemoCustomer } from "./demo-data";
import { DEMO_CUSTOMERS } from "./demo-data";

/**
 * Generated and edge-case customers for the scenario stories (many records,
 * very long text, odd characters, archived). Deterministic: the same call
 * always returns the same data, so screenshots are stable.
 */

const FIRST = ["Clínica", "Panadería", "Estudio", "Taller", "Academia", "Gimnasio", "Floristería", "Asesoría", "Restaurante", "Óptica", "Veterinaria", "Librería", "Inmobiliaria", "Peluquería", "Ferretería"];
const SECOND = ["Sonrisa", "La Espiga", "Norte", "Ruedas", "Ibáñez", "Fuerte", "Las Rosas", "Mediterráneo", "El Faro", "Visión", "Patitas", "Atlas", "Costa", "Estilo", "Martínez"];
const TAGS = ["Salud", "Redes", "Web", "Comercio local", "Coaching", "Automoción", "Bienestar", "Arquitectura"];
const OWNERS = ["Tú", "Marta (agente de cuentas)", "Diego (agente comercial)"];
const PEOPLE = ["Laura Gómez", "Iván Ruiz", "Antonio Pérez", "Elena Navarro", "Pablo Ortega", "Lucía Martín", "Raúl Sánchez", "Sara Vidal", "Marcos Ibáñez", "Carolina Bravo"];
const ACTIONS = ["Revisar entregables antes del viernes", "Responder dudas sobre la renovación", "Llamar para cerrar la propuesta", "Enviar el calendario del mes", null, null];

function rng(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const contact = (id: string, name: string, index: number): DemoContact => ({
  id, name, title: index === 0 ? "Responsable" : null, email: `${name.split(" ")[0]!.toLowerCase()}@ejemplo.es`, phone: null, primary: index === 0,
  channel: (["email", "whatsapp", "phone"] as const)[index % 3]!,
});

export function makeManyCustomers(count: number): DemoCustomer[] {
  const random = rng(42);
  return Array.from({ length: count }, (_, index) => {
    const round = Math.floor(index / 15);
    const name = `${FIRST[index % 15]} ${SECOND[(index * 7) % 15]}${round ? ` ${round + 1}` : ""}`;
    const health: DemoCustomer["health"] = index % 7 === 0 ? "risk" : index % 3 === 0 ? "watch" : "good";
    const people = 1 + Math.floor(random() * 3);
    const services = Math.floor(random() * 3);
    return {
      id: `m${index}`, name, kind: "organization", domain: `${name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "")}.es`,
      tags: [TAGS[index % TAGS.length]!, ...(index % 4 === 0 ? [TAGS[(index + 3) % TAGS.length]!] : [])],
      health, owner: OWNERS[index % 3]!,
      contacts: Array.from({ length: people }, (_, personIndex) => contact(`m${index}-p${personIndex}`, PEOPLE[(index + personIndex * 3) % PEOPLE.length]!, personIndex)),
      services: Array.from({ length: services }, (_, serviceIndex) => ({
        id: `m${index}-s${serviceIndex}`, name: serviceIndex ? "Campañas de anuncios" : "Gestión de redes sociales",
        monthlyCents: (150 + Math.floor(random() * 500)) * 100, nextRenewal: `2026-11-${String(1 + ((index + serviceIndex) % 28)).padStart(2, "0")}`,
        status: (health === "risk" && serviceIndex === 0 ? "paused" : index % 11 === 0 ? "renewing" : "active") as "active" | "renewing" | "paused",
      })),
      openProposals: index % 5 === 0 ? [{ id: `m${index}-pr`, title: "Propuesta de servicios", amountCents: (500 + Math.floor(random() * 3000)) * 100, status: (["sent", "viewed", "draft"] as const)[index % 3]! }] : [],
      activeTasks: Math.floor(random() * 9), pendingReviews: Math.floor(random() * 3), unreadConversations: index % 6 === 0 ? 1 + (index % 3) : 0,
      lastActivity: "2026-10-22T10:00:00Z", lastActivityLabel: "Actividad reciente en su cuenta",
      nextAction: ACTIONS[index % ACTIONS.length] ?? null, createdAt: index % 9 === 0 ? "2026-10-10" : "2025-06-01",
    } satisfies DemoCustomer;
  });
}

/** Very long text, emoji, right-to-left and CJK scripts, one-letter names and unbroken words. */
export const LONG_TEXT_CUSTOMERS: DemoCustomer[] = [
  {
    id: "l1", name: "Asociación Internacional de Profesionales de la Fisioterapia, la Rehabilitación Deportiva y la Medicina Integrativa de la Comunidad Valenciana S.L.U.",
    kind: "organization", domain: "asociacion-internacional-profesionales-fisioterapia-rehabilitacion-deportiva-medicina-integrativa.example.com",
    tags: ["Salud y bienestar integral para deportistas profesionales y aficionados", "Formación continua", "Congresos y eventos", "Publicaciones científicas", "Convenios con universidades"],
    health: "watch", owner: "Marta (agente de cuentas)",
    contacts: [
      { id: "l1-p1", name: "María del Carmen de los Ángeles Fernández-Villaverde y Sánchez-Cano", title: "Directora de Relaciones Institucionales y Desarrollo de Negocio Internacional", email: "maria.del.carmen.fernandez-villaverde.sanchez-cano@asociacion-internacional-profesionales.example.com", phone: null, primary: true, channel: "email" },
      { id: "l1-p2", name: "Jo", title: null, email: null, phone: "+34 600 000 000", primary: false, channel: "phone" },
    ],
    services: [{ id: "l1-s1", name: "Gestión integral de comunicación institucional, redes sociales, boletín mensual y memoria anual", monthlyCents: 245000, nextRenewal: "2026-12-01", status: "renewing" }],
    openProposals: [{ id: "l1-pr", title: "Rediseño completo del portal del asociado con área privada, pasarela de cuotas y calendario de congresos", amountCents: 1850000, status: "sent" }],
    activeTasks: 14, pendingReviews: 3, unreadConversations: 7,
    lastActivity: "2026-10-23T09:00:00Z", lastActivityLabel: "Solicitaron una reunión extraordinaria con toda la junta directiva para revisar el calendario completo del próximo trimestre",
    nextAction: "Preparar la presentación para la junta directiva del jueves con el resumen de resultados de los últimos seis meses", createdAt: "2023-02-01",
  },
  {
    id: "l2", name: "🥐 Panadería Ñandú — Ç & Co. «Pan de ayer, sabor de siempre»", kind: "organization", domain: "pan-ñandú.example",
    tags: ["🍞 Comercio", "Café & Té", "100 % artesano"], health: "good", owner: "Tú",
    contacts: [{ id: "l2-p1", name: "Ñusta Çelik-O'Brien", title: "Propietaria", email: "ñusta@pan-ñandú.example", phone: null, primary: true, channel: "whatsapp" }],
    services: [], openProposals: [], activeTasks: 2, pendingReviews: 0, unreadConversations: 0,
    lastActivity: "2026-10-22T10:00:00Z", lastActivityLabel: "Se publicó la carta de otoño", nextAction: null, createdAt: "2026-05-01",
  },
  {
    id: "l3", name: "مطعم النخيل — 株式会社さくら", kind: "organization", domain: "نخيل.example",
    tags: ["مطاعم", "レストラン"], health: "good", owner: "Diego (agente comercial)",
    contacts: [{ id: "l3-p1", name: "محمد الأحمد", title: "المدير", email: "m.ahmad@example.com", phone: null, primary: true, channel: "email" }],
    services: [{ id: "l3-s1", name: "حملة إعلانية", monthlyCents: 90000, nextRenewal: "2026-11-09", status: "active" }],
    openProposals: [], activeTasks: 1, pendingReviews: 0, unreadConversations: 1,
    lastActivity: "2026-10-23T09:00:00Z", lastActivityLabel: "رسالة جديدة", nextAction: "الرد على الرسالة", createdAt: "2026-01-12",
  },
  {
    id: "l4", name: "Supercalifragilisticoespialidosoconsultoriaintegraldeserviciosprofesionalesyempresariales", kind: "organization", domain: null,
    tags: [], health: "risk", owner: "Tú",
    contacts: [], services: [], openProposals: [], activeTasks: 0, pendingReviews: 0, unreadConversations: 0,
    lastActivity: "2026-08-01T10:00:00Z", lastActivityLabel: "Sin actividad desde hace 12 semanas", nextAction: "Decidir si seguimos trabajando con este cliente", createdAt: "2024-01-01",
  },
  {
    id: "l5", name: "Ñ", kind: "person", domain: null, tags: ["X"], health: "good", owner: "Tú",
    contacts: [{ id: "l5-p1", name: "Ñ", title: null, email: null, phone: null, primary: true, channel: "email" }],
    services: [], openProposals: [], activeTasks: 0, pendingReviews: 0, unreadConversations: 0,
    lastActivity: "2026-10-01T10:00:00Z", lastActivityLabel: "Sin actividad", nextAction: null, createdAt: "2026-10-01",
  },
];

export const ARCHIVED_CUSTOMERS: DemoCustomer[] = [
  { ...DEMO_CUSTOMERS[1]!, id: "a1", name: "Cafetería El Rincón", domain: "elrincon.es", archived: true, health: "good", nextAction: null, lastActivityLabel: "Archivado: cerró el negocio en septiembre", services: [], openProposals: [], activeTasks: 0, pendingReviews: 0, unreadConversations: 0 },
  { ...DEMO_CUSTOMERS[4]!, id: "a2", name: "Gimnasio Fuerte", domain: "gimnasiofuerte.es", archived: true, health: "watch", nextAction: null, lastActivityLabel: "Archivado: pausa estacional", services: [], openProposals: [], activeTasks: 0, pendingReviews: 0, unreadConversations: 0 },
  { ...DEMO_CUSTOMERS[3]!, id: "a3", name: "Tienda Luna", kind: "organization", domain: "tiendaluna.es", archived: true, nextAction: null, lastActivityLabel: "Archivado: proyecto terminado", services: [], openProposals: [], activeTasks: 0, pendingReviews: 0, unreadConversations: 0 },
];
