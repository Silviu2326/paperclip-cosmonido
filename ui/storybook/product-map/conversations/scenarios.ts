import { DEMO_THREADS, type Channel, type DemoMessage, type DemoThread } from "./demo-data";

/**
 * Data for the extra states of the Conversaciones page. Everything is derived
 * from DEMO_THREADS so the people and customers stay consistent with the other
 * proposals.
 */
export type ConversationsScenario =
  | "normal"
  | "cargando"
  | "error"
  | "muchos"
  | "textos-largos"
  | "sin-permisos"
  | "canal-desconectado"
  | "fuera-de-plazo"
  | "hilo-largo";

const FIRST = ["Lucía", "Mateo", "Carmen", "Iván", "Paula", "Hugo", "Irene", "Álvaro", "Noa", "Pablo", "Sara", "Diego", "Marta", "Raúl", "Elena"];
const LAST = ["García", "Martín", "López", "Sánchez", "Pérez", "Gómez", "Ruiz", "Navarro", "Vidal", "Ortega", "Romero", "Serrano"];
const BUSINESS = ["Floristería Las Rosas", "Gimnasio Fuerte", "Academia Ibáñez", "Taller Ruedas", "Yoga Bahía", "Clínica Sonrisa", "Panadería La Espiga", "Estudio Norte", "Café Lumbre", "Ferretería Centro"];
const SUBJECTS = ["Duda sobre la factura", "Cambio de horario", "¿Podéis enviarme el informe?", "Presupuesto para el nuevo servicio", "Reseñas de Google", "Problema con el acceso", "Renovación del plan", "Fotos para el catálogo"];
const PREVIEWS = ["Hola, ¿me podéis ayudar con esto?", "Gracias, lo reviso y os digo.", "¿Cuándo estaría listo?", "Perfecto, adelante.", "No me llegó el correo.", "Os llamo mañana a primera hora."];
const CHANNELS: Channel[] = ["whatsapp", "email", "webchat", "voice"];
const STATUSES = ["waiting_us", "waiting_us", "open", "waiting_them", "closed"] as const;

const context: DemoThread["context"] = { health: "good", services: "Servicio mensual · 150 €/mes", openProposal: null, nextAction: null };

/** About 180 generated threads for the "muchos datos" state. */
export function manyThreads(count = 180): DemoThread[] {
  const generated = Array.from({ length: count }, (_, index): DemoThread => {
    const contact = `${FIRST[index % FIRST.length]} ${LAST[(index * 7) % LAST.length]}`;
    const status = STATUSES[index % STATUSES.length]!;
    const late = status === "waiting_us" && index % 6 === 0;
    return {
      id: `g${index}`,
      channel: CHANNELS[index % CHANNELS.length]!,
      subject: SUBJECTS[index % SUBJECTS.length]!,
      customer: BUSINESS[(index * 3) % BUSINESS.length]!,
      contact,
      status,
      priority: late ? "urgent" : "normal",
      slaDueLabel: status === "waiting_us" ? (late ? `Vencida hace ${1 + (index % 5)} h` : `Responde en ${10 + (index % 50)} min`) : null,
      slaLate: late,
      assignedTo: index % 3 === 0 ? "Tú" : "Marta (agente de cuentas)",
      lastLabel: index < 12 ? `hace ${index + 1} h` : `hace ${1 + Math.floor(index / 12)} días`,
      unread: status === "waiting_us" ? 1 + (index % 3) : 0,
      preview: PREVIEWS[index % PREVIEWS.length]!,
      messages: [{ id: `g${index}-1`, direction: "inbound", actor: "contact", author: contact, body: PREVIEWS[index % PREVIEWS.length]!, at: "Hoy 09:10" }],
      suggestion: null,
      context,
    };
  });
  return [...DEMO_THREADS, ...generated];
}

const LONG_COMPANY = "Asociación Provincial de Propietarios de Establecimientos de Hostelería, Restauración y Turismo Rural de la Comunidad Valenciana S.L.U.";
const LONG_URL = "https://www.ejemplo-con-un-dominio-muy-largo.com/documentos/compartidos/2026/octubre/propuesta-definitiva-version-final-v7-revisada-por-direccion-y-asesoria-juridica.pdf?utm_source=whatsapp&utm_medium=mensaje&utm_campaign=seguimiento";

/** Very long names and subjects, emoji, accents, right-to-left and CJK text, and an unbreakable URL. */
export function longTextThreads(): DemoThread[] {
  const base = DEMO_THREADS[0]!;
  const make = (id: string, patch: Partial<DemoThread>): DemoThread => ({ ...base, id, unread: 2, ...patch });
  return [
    make("l1", {
      contact: "José María de los Ángeles Fernández-Villaverde y Ordóñez de la Torre",
      customer: LONG_COMPANY,
      subject: "Re: Re: Re: Fwd: Urgente — revisión del contrato de mantenimiento anual con las condiciones modificadas el pasado lunes",
      preview: `Os paso el enlace al documento completo: ${LONG_URL}`,
      messages: [
        { id: "l1-1", direction: "inbound", actor: "contact", author: "José María de los Ángeles Fernández-Villaverde y Ordóñez de la Torre", body: `Buenas tardes, os paso el enlace al documento completo para que lo reviséis antes de la reunión: ${LONG_URL}`, at: "Hoy 09:02" },
        { id: "l1-2", direction: "inbound", actor: "contact", author: "José María de los Ángeles Fernández-Villaverde y Ordóñez de la Torre", body: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", at: "Hoy 09:03" },
      ],
    }),
    make("l2", { contact: "Müller & Söhne GmbH — Zürich", customer: "Müller & Söhne GmbH", subject: "Anfrage: Übersetzung der Website 🇨🇭", preview: "Guten Tag, wir hätten gern ein Angebot für 5 Sprachen 🙏", channel: "email" }),
    make("l3", { contact: "株式会社さくら 田中 美咲", customer: "株式会社さくら", subject: "ご依頼の件について", preview: "お世話になっております。見積書をお送りいただけますか？", channel: "email" }),
    make("l4", { contact: "مكتب النور للاستشارات", customer: "مكتب النور للاستشارات", subject: "طلب عرض سعر", preview: "مرحبا، نود الحصول على عرض سعر لإدارة حساباتنا", channel: "whatsapp" }),
    make("l5", { contact: "👩‍🍳 Cocina de Lola 🍳", customer: "Cocina de Lola", subject: "¡¡¡URGENTE!!! 🔥🔥🔥", preview: "😍😍😍 ¿¿Me llamáis?? 📞", channel: "whatsapp" }),
    make("l6", { contact: "Ñandú & O'Brien, S. L. (Ltd.)", customer: "Ñandú & O'Brien", subject: "Pedido nº 2026/10/0042-B (revisión 3)", preview: "<b>¿Podéis confirmarlo?</b> &amp; “comillas” — «latinas»", channel: "webchat" }),
  ];
}

/** A single thread with 70 messages, to check scrolling, anchoring and the date separators. */
export function longThread(): DemoThread[] {
  const base = DEMO_THREADS[0]!;
  const lines = ["Buenas, una duda sobre el plan.", "Claro, dime.", "¿Incluye las campañas de Navidad?", "Sí, entran sin coste extra.", "Perfecto. ¿Y el informe mensual?", "Lo recibes el día 1 de cada mes.", "Genial, gracias.", "A ti. Cualquier cosa me escribes."];
  const messages: DemoMessage[] = Array.from({ length: 70 }, (_, index) => {
    const inbound = index % 2 === 0;
    return {
      id: `h${index}`,
      direction: inbound ? "inbound" : "outbound",
      actor: inbound ? "contact" : "agent",
      author: inbound ? "Antonio Pérez" : "Nora (agente de email)",
      body: `${lines[index % lines.length]} (${index + 1})`,
      at: index < 20 ? "Semana pasada" : index < 50 ? "Ayer" : "Hoy",
      delivery: inbound ? undefined : "read",
    };
  });
  return [{ ...base, id: "long", messages, unread: 1, preview: messages[messages.length - 1]!.body }, ...DEMO_THREADS.slice(1)];
}

/** Several threads past their reply deadline, oldest first. */
export function overdueThreads(): DemoThread[] {
  const waiting = [...DEMO_THREADS, ...manyThreads(12).slice(DEMO_THREADS.length)].filter((thread) => thread.status !== "closed").slice(0, 8);
  return waiting.map((thread, index) => ({
    ...thread,
    status: "waiting_us",
    priority: index < 3 ? "urgent" : "high",
    slaLate: true,
    slaDueLabel: `Vencida hace ${(index + 1) * 3} h`,
    unread: Math.max(thread.unread, 1),
  }));
}
