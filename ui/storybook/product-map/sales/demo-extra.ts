import { DEMO_LEADS, DEMO_OPPORTUNITIES, DEMO_PROPOSALS, STAGES, type DemoLead, type DemoOpportunity, type DemoProposal, type StageKey } from "./demo-data";

function seeded(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const CUSTOMERS = ["Clínica Dental Sonrisa", "Panadería La Espiga", "Estudio Arquitectura Norte", "Lucía Martín", "Taller Mecánico Ruedas", "Yoga Bahía", "Gimnasio Fuerte", "Academia Ibáñez", "Carolina Bravo", "Óptica Visión", "Bufete Ramos", "Floristería Las Rosas"];
const SERVICES = ["Gestión de redes", "Web nueva", "Newsletter mensual", "Vídeo corporativo", "Campaña de Google Ads", "Rediseño de marca", "Informe SEO", "Pack de reels"];
const OWNERS = ["Tú", "Diego (agente comercial)", "Marta (agente de cuentas)"];
const NEXT_ACTIONS = ["Llamar para cerrar", "Enviar propuesta", "Responder dudas", "Presentar la propuesta", "Pedir feedback", "Preparar presupuesto", null];

/** 120 opportunities spread over the five stages, to test columns that need "Ver más". */
export function manyOpportunities(count = 120): DemoOpportunity[] {
  const random = seeded(23);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  return Array.from({ length: count }, (_, index) => {
    const stage = pick(STAGES).key;
    const customer = pick(CUSTOMERS);
    const amount = (3 + Math.floor(random() * 90)) * 5000;
    return {
      id: `mo-${index}`,
      title: `${pick(SERVICES)}`,
      customer,
      contact: customer,
      stage,
      amountCents: amount,
      probability: stage === "won" ? 100 : stage === "new" ? 25 : stage === "qualified" ? 50 : stage === "proposal" ? 60 : 75,
      expectedCloseAt: `2026-1${1 + Math.floor(random() * 2)}-${String(3 + Math.floor(random() * 25)).padStart(2, "0")}`,
      owner: pick(OWNERS),
      nextAction: stage === "won" ? null : pick(NEXT_ACTIONS),
      nextActionAt: stage === "won" ? null : `2026-10-${24 + Math.floor(random() * 7)}`,
      stalledDays: Math.floor(random() * random() * 40),
      proposalId: null,
    } satisfies DemoOpportunity;
  });
}
export const MANY_OPPORTUNITIES: DemoOpportunity[] = [...DEMO_OPPORTUNITIES, ...manyOpportunities()];

const NAMES = ["Marta Gil", "Pablo Ortega", "Irene Soto", "Hugo Vidal", "Nuria Campos", "Álex Ferrer", "Sonia Ibarra", "Rubén Cano"];
const MESSAGES = ["Querríamos presupuesto para gestionar nuestras redes.", "¿Hacéis webs con reservas online?", "Necesito un vídeo corporativo para la feria de diciembre.", "Me interesa la newsletter mensual, ¿cuánto cuesta?", "¿Podéis ayudarnos con las reseñas de Google?"];
const SOURCES: DemoLead["source"][] = ["form", "whatsapp", "webchat", "email", "voice"];

export function manyLeads(count = 80): DemoLead[] {
  const random = seeded(31);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  return Array.from({ length: count }, (_, index) => {
    const name = pick(NAMES);
    return {
      id: `ml-${index}`,
      name,
      company: random() < 0.5 ? pick(CUSTOMERS) : null,
      source: pick(SOURCES),
      message: pick(MESSAGES),
      priority: random() < 0.15 ? "high" : random() < 0.5 ? "normal" : "low",
      receivedAt: "2026-10-22T10:00:00Z",
      receivedLabel: `hace ${1 + Math.floor(random() * 9)} días`,
      status: "new",
      existingCustomer: null,
      suggestion: "Cualifica con una respuesta corta antes de crear nada.",
    } satisfies DemoLead;
  });
}
export const MANY_LEADS: DemoLead[] = [...DEMO_LEADS, ...manyLeads()];

export function manyProposals(count = 24): DemoProposal[] {
  const random = seeded(47);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)]!;
  const statuses: DemoProposal["status"][] = ["draft", "sent", "sent", "viewed", "viewed", "expired"];
  return Array.from({ length: count }, (_, index) => {
    const status = pick(statuses);
    return {
      id: `mp-${index}`,
      title: pick(SERVICES),
      customer: pick(CUSTOMERS),
      amountCents: (4 + Math.floor(random() * 80)) * 5000,
      status,
      validUntil: status === "draft" ? null : "2026-11-15",
      views: status === "sent" ? 0 : 1 + Math.floor(random() * 4),
      note: status === "draft" ? "Borrador sin enviar" : status === "sent" ? "Sin abrir todavía" : status === "expired" ? "Caducó sin respuesta" : "La abrió esta semana",
      opportunityId: null,
    } satisfies DemoProposal;
  });
}
export const MANY_PROPOSALS: DemoProposal[] = [...DEMO_PROPOSALS, ...manyProposals()];

const LONG_URL = "https://www.ejemplo-de-un-cliente-con-un-dominio-larguisimo.com/ruta/sin/espacios/que/no/se/puede/partir/jamas?utm_source=newsletter";
const LONG_CUSTOMER = "Asociación de Propietarios y Vecinos del Polígono Industrial «Las Encinas de Arriba» y Comarca";

/** Long titles and customers, other alphabets, emoji and an unbreakable URL. */
export const LONG_OPPORTUNITIES: DemoOpportunity[] = [
  { ...DEMO_OPPORTUNITIES[0]!, id: "lo1", title: "Programa integral de transformación digital, comunicación y captación de socios del Polígono Industrial para el ejercicio 2027–2028", customer: LONG_CUSTOMER, contact: "Sr. D. José María de la Concepción Fernández-Villaescusa y Martínez de Zúñiga", nextAction: "Presentar el borrador del contrato marco y las condiciones de renovación automática a la junta directiva" },
  { ...DEMO_OPPORTUNITIES[1]!, id: "lo2", title: "Ñandú & Hijos, S.L. — 清洁服务 (限时优惠) 🧹✨", customer: "Ñandú & Hijos, S.L.", contact: "李小龙", nextAction: "¿¡Llamar ya!?" },
  { ...DEMO_OPPORTUNITIES[2]!, id: "lo3", title: "مراجعة قائمة الطعام الجديدة لمقهى النخيل", customer: "مقهى النخيل", contact: "أحمد" },
  { ...DEMO_OPPORTUNITIES[3]!, id: "lo4", title: LONG_URL, customer: "dominio-larguisimo.com", contact: "Web", nextAction: LONG_URL },
  { ...DEMO_OPPORTUNITIES[4]!, id: "lo5", title: "Hola", customer: "X", contact: "X" },
  { ...DEMO_OPPORTUNITIES[5]!, id: "lo6", title: "Importe enorme para comprobar el formato", customer: "Gran Cuenta, S.A.", contact: "Dirección", amountCents: 987654321 },
  { ...DEMO_OPPORTUNITIES[6]!, id: "lo7", title: "Campaña ganada con nombre largo para comprobar la columna de ganadas", customer: LONG_CUSTOMER, contact: "Admin" },
];
export const LONG_LEADS: DemoLead[] = [
  { ...DEMO_LEADS[0]!, id: "ll1", name: "Sr. D. José María de la Concepción Fernández-Villaescusa y Martínez de Zúñiga", company: LONG_CUSTOMER, message: "Mensaje muy largo. ".repeat(24) },
  { ...DEMO_LEADS[1]!, id: "ll2", name: "李小龙 (Bruce) 🧹", company: "清洁服务有限公司", message: "你好，我们想了解你们的网站设计服务和价格。Hola, queremos presupuesto." },
  { ...DEMO_LEADS[2]!, id: "ll3", name: "x", company: null, message: LONG_URL },
];
export const LONG_PROPOSALS: DemoProposal[] = [
  { ...DEMO_PROPOSALS[0]!, id: "lp1", title: "Propuesta de servicios de comunicación, marketing digital y captación de socios para el Polígono Industrial «Las Encinas de Arriba»", customer: LONG_CUSTOMER, note: "Lo abrió 4 veces esta semana y la compartió con otras 7 personas de la junta directiva" },
  { ...DEMO_PROPOSALS[1]!, id: "lp2", title: LONG_URL, customer: "dominio-larguisimo.com" },
];

/** An opportunity that has not moved for six weeks, and one that has not for five. */
export const STALLED_OPPORTUNITIES: DemoOpportunity[] = DEMO_OPPORTUNITIES.map((opportunity) =>
  opportunity.id === "o2" ? { ...opportunity, stalledDays: 45, nextAction: "Reactivar: sin respuesta desde la presentación", nextActionAt: "2026-10-24" }
  : opportunity.id === "o6" ? { ...opportunity, stalledDays: 38 }
  : opportunity);

/** The same person arrives again: the form says it is Raúl from Taller Ruedas, who is already a customer. */
export const DUPLICATE_LEAD: DemoLead = {
  id: "ld1", name: "Raúl Sánchez Pérez", company: "Taller Ruedas", source: "form", message: "Quiero también presupuesto para la web del taller.", priority: "normal",
  receivedAt: "2026-10-24T09:10:00Z", receivedLabel: "hace 30 min", status: "new", existingCustomer: null,
  suggestion: "Misma persona y empresa que un cliente existente: enlázalo en vez de crear otro.",
  duplicateOf: { name: "Raúl Sánchez", customer: "Taller Mecánico Ruedas", matchOn: "el mismo email y un nombre casi idéntico" },
};

/** Remove one stage so the board shows an empty column. */
export function withoutStage(opportunities: DemoOpportunity[], stage: StageKey): DemoOpportunity[] {
  return opportunities.filter((opportunity) => opportunity.stage !== stage);
}
