import { DEMO_AGENTS, DEMO_CONVERSATIONS, type DemoAgent, type DemoConversation, type DemoMessage } from "./demo-data";
import type { ChatBehavior } from "./ChatProposal";

/** Extra states of the Chat con agentes page, derived from the base demo so names stay consistent. */
export type ChatScenario =
  | "normal"
  | "cargando"
  | "error"
  | "muchos"
  | "textos-largos"
  | "sin-permisos"
  | "conexion-perdida"
  | "respuesta-en-streaming"
  | "mensaje-fallido"
  | "agente-pidiendo-permiso";

export interface ChatScenarioData {
  agents: DemoAgent[];
  conversations: Record<string, DemoConversation>;
  initialAgentId: string | null;
  pageSize: number;
  behavior?: ChatBehavior;
}

const base = (agentId: string) => DEMO_CONVERSATIONS[agentId]!;
const withMessages = (agentId: string, messages: DemoMessage[]): Record<string, DemoConversation> => ({ ...DEMO_CONVERSATIONS, [agentId]: { ...base(agentId), messages } });

const NAMES = ["Ada", "Bruno", "Clara", "Dario", "Eva", "Fabio", "Gema", "Hugo", "Inés", "Jano", "Kira", "Mía", "Nico", "Olga", "Pau", "Rita"];
const ROLES = ["Agente de cuentas", "Agente comercial", "Creador de contenido", "Editor de vídeo", "Agente de email", "Investigador"];
const STATUSES: DemoAgent["status"][] = ["idle", "working", "idle", "needs-you", "paused", "idle"];

function manyAgents(count = 150): DemoAgent[] {
  const generated = Array.from({ length: count }, (_, index): DemoAgent => ({
    id: `g${index}`,
    name: `${NAMES[index % NAMES.length]} ${Math.floor(index / NAMES.length) + 1}`,
    role: ROLES[index % ROLES.length]!,
    color: (index % 10) + 1,
    status: STATUSES[index % STATUSES.length]!,
    doing: index % 6 === 1 ? `Tarea ${100 + index} en curso` : undefined,
    unread: index % 9 === 0 ? 1 + (index % 3) : 0,
    lastMessage: "Te dejo el resumen de lo que hice hoy.",
    lastAt: index < 10 ? `hace ${index + 2} min` : `hace ${1 + Math.floor(index / 12)} d`,
  }));
  return [...DEMO_AGENTS, ...generated];
}

/** 130 messages in one conversation, to check history paging and the scroll position. */
function longConversation(): DemoMessage[] {
  const lines = [
    ["user", "¿Cómo va el calendario de la clínica?"], ["agent", "Voy por la semana 3. ¿Mantengo el tono cercano?"],
    ["user", "Sí, y evita promociones agresivas."], ["agent", "Hecho. Ajusto los textos y te enseño un ejemplo."],
    ["user", "Perfecto, gracias."], ["agent", "Te aviso cuando esté listo para tu revisión."],
  ] as const;
  const messages: DemoMessage[] = Array.from({ length: 130 }, (_, index) => {
    const [from, text] = lines[index % lines.length]!;
    return { id: `h${index}`, kind: "text", from, text: `${text} (${index + 1})`, at: index < 60 ? "Hace 2 días" : index < 110 ? "Ayer" : "Hoy" };
  });
  messages.push(...(base("a-ceo").messages.filter((message) => message.kind !== "text")));
  return messages;
}

const LONG_URL = "https://www.un-enlace-larguisimo-que-no-se-puede-partir-en-palabras.example.com/documentos/compartidos/2026/octubre/propuesta-definitiva-version-final-v7-revisada.pdf?utm_source=chat&utm_medium=agente";

function longTextData(): ChatScenarioData {
  const agents: DemoAgent[] = [
    { id: "x1", name: "Maximiliano José de la Santísima Trinidad Fernández-Villaverde", role: "Responsable de cuentas estratégicas, relaciones institucionales y atención posventa", color: 7, status: "needs-you", unread: 12, lastMessage: `Te paso el enlace al documento completo: ${LONG_URL}`, lastAt: "hace 4 min" },
    { id: "x2", name: "Müller-Åkesson 🤖", role: "Übersetzer · Traducción DE/EN/ES", color: 8, status: "working", doing: "Übersetzung der Website · Traduciendo la web al alemán", unread: 0, lastMessage: "Guten Tag! Ich habe die erste Seite fertig.", lastAt: "hace 1 min" },
    { id: "x3", name: "さくら（桜）", role: "ローカライズ担当 · Localización japonesa", color: 2, status: "idle", unread: 1, lastMessage: "お世話になっております。見積書をお送りしました。", lastAt: "ayer" },
    { id: "x4", name: "نور الهدى", role: "مسؤولة خدمة العملاء · Atención en árabe", color: 3, status: "idle", unread: 0, lastMessage: "مرحبا، كيف يمكنني مساعدتك اليوم؟", lastAt: "ayer" },
    { id: "x5", name: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", role: "Sin espacios", color: 5, status: "paused", unread: 0, lastMessage: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB", lastAt: "hace 2 días" },
  ];
  const messages: DemoMessage[] = [
    { id: "l1", kind: "text", from: "user", text: "¿Puedes revisar este documento? " + LONG_URL, at: "10:02" },
    { id: "l2", kind: "text", from: "agent", text: `Claro. Lo he leído entero. Resumen: ${"las condiciones del contrato marco incluyen una cláusula de renovación automática y penalizaciones por desistimiento anticipado; ".repeat(3)}`, at: "10:04" },
    { id: "l3", kind: "text", from: "user", text: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", at: "10:05" },
    { id: "l4", kind: "text", from: "agent", text: "Müller & Söhne GmbH — «Ñandú» 😍🔥 مرحبا بالعالم 你好，世界 ¿Qué tal? <b>no es HTML</b> &amp; \"comillas\"", at: "10:06" },
    { id: "l5", kind: "task", title: "Revisar el contrato marco con la Asociación Provincial de Propietarios de Establecimientos de Hostelería, Restauración y Turismo Rural de la Comunidad Valenciana", identifier: "PAP-1042-B-revisión-3", status: "in_review", at: "10:07" },
    { id: "l6", kind: "deliverable", title: "Informe-de-revision-de-contrato-con-nombre-de-archivo-extremadamente-largo-v12-FINAL-definitivo-ahora-si.pdf", fileKind: "doc", meta: "Documento · 48 páginas · 12,4 MB", at: "10:08" },
  ];
  return { agents, conversations: { x1: { agentId: "x1", messages, suggestions: ["¿Qué necesita mi decisión esta semana?", "Resume el documento en tres puntos"], tasks: [], artifacts: [] } }, initialAgentId: "x1", pageSize: 0 };
}

export function chatScenarioData(scenario: ChatScenario): ChatScenarioData {
  const agents = DEMO_AGENTS;
  switch (scenario) {
    case "muchos": return { agents: manyAgents(), conversations: withMessages("a-ceo", longConversation()), initialAgentId: "a-ceo", pageSize: 24, behavior: { historyLimit: 30 } };
    case "textos-largos": return longTextData();
    case "conexion-perdida": return { agents, conversations: DEMO_CONVERSATIONS, initialAgentId: "a-ceo", pageSize: 0, behavior: { offline: true } };
    case "respuesta-en-streaming": {
      const messages: DemoMessage[] = [
        { id: "s1", kind: "text", from: "user", text: "Diego, resúmeme en qué punto está cada propuesta abierta.", at: "11:20" },
      ];
      return {
        agents, conversations: withMessages("a-ceo", messages), initialAgentId: "a-ceo", pageSize: 0,
        behavior: { stream: "Tienes cuatro propuestas abiertas. La de Clínica Sonrisa (2.400 €) está en negociación y la han abierto cuatro veces esta semana; solo falta que la apruebes para enviarla. La de Arquitectura Norte (3.800 €) lleva tres semanas sin abrirse, así que te propongo llamarles hoy a las 17:15. La de Taller Ruedas (450 €) está casi cerrada: Raúl dejó un buzón de voz. Y el curso de Lucía (1.500 €) sigue en borrador. ¿Quieres que prepare el mensaje de seguimiento para la de Arquitectura Norte?" },
      };
    }
    case "mensaje-fallido": {
      const messages: DemoMessage[] = [
        ...base("a-ceo").messages.slice(0, 4),
        { id: "f1", kind: "text", from: "user", text: "Súbele el precio medio un 5 % y mándala.", at: "10:09", failed: true },
      ];
      return { agents, conversations: withMessages("a-ceo", messages), initialAgentId: "a-ceo", pageSize: 0 };
    }
    case "agente-pidiendo-permiso": {
      const messages: DemoMessage[] = [
        { id: "p1", kind: "text", from: "user", text: "Marta, ¿puedes mirar si la clínica nos ha escrito algo sobre el calendario?", at: "11:02" },
        { id: "p2", kind: "text", from: "agent", text: "Puedo, pero no tengo acceso al correo de la empresa todavía.", at: "11:02" },
        { id: "p3", kind: "permission", title: "Marta quiere leer los correos de Clínica Dental Sonrisa", detail: "Para buscar los mensajes sobre el calendario de noviembre. No enviará ni borrará nada.", scope: "Gmail · solo lectura · solo correos de laura@clinicasonrisa.es · últimos 30 días", state: "pending", at: "11:03" },
      ];
      return { agents, conversations: withMessages("a-content", messages), initialAgentId: "a-content", pageSize: 0 };
    }
    default: return { agents, conversations: DEMO_CONVERSATIONS, initialAgentId: "a-ceo", pageSize: 0 };
  }
}
