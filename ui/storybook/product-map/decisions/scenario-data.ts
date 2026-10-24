import { DEMO_DECISIONS, type DemoDecision } from "./demo-data";

/** Generated and edge-case decisions for the scenario stories. Deterministic. */

const TITLES: { sourceKind: DemoDecision["sourceKind"]; severity: DemoDecision["severity"]; title: string; whyNow: string; verbs: DemoDecision["verbs"] }[] = [
  { sourceKind: "approval", severity: "high", title: "Publicar el calendario de contenidos", whyNow: "El cliente espera empezar la semana que viene.", verbs: ["approve", "reject"] },
  { sourceKind: "review", severity: "medium", title: "Revisar el entregable de diseño", whyNow: "Es la primera entrega del servicio.", verbs: ["review"] },
  { sourceKind: "issue_thread_interaction", severity: "high", title: "¿Qué tono usamos en la newsletter?", whyNow: "El agente espera tu respuesta para continuar.", verbs: ["answer"] },
  { sourceKind: "failed_run", severity: "medium", title: "Falló el envío programado", whyNow: "La conexión rechazó las credenciales.", verbs: ["retry"] },
  { sourceKind: "budget_alert", severity: "critical", title: "Presupuesto de un agente casi agotado", whyNow: "Se pausará si llega al 100 %.", verbs: ["raise_budget", "reject"] },
  { sourceKind: "join_request", severity: "low", title: "Solicitud de acceso de un contacto", whyNow: "Quiere ver el avance de su proyecto.", verbs: ["accept", "reject"] },
  { sourceKind: "decision", severity: "low", title: "¿Contratamos un agente adicional?", whyNow: "La carga de trabajo subió esta semana.", verbs: ["approve", "reject"] },
];
const AGENTS = ["Marta (agente de cuentas)", "Diego (agente comercial)", "Leo (editor de vídeo)", "Nora (agente de email)", null];
const CUSTOMERS = ["Clínica Dental Sonrisa", "Panadería La Espiga", "Estudio Arquitectura Norte", "Yoga Bahía", "Taller Mecánico Ruedas", null];

export function makeManyDecisions(count: number): DemoDecision[] {
  return Array.from({ length: count }, (_, index) => {
    const base = TITLES[index % TITLES.length]!;
    return {
      id: `g${index}`, sourceKind: base.sourceKind, severity: base.severity, title: `${base.title} #${index + 1}`, whyNow: base.whyNow, verbs: base.verbs,
      agent: AGENTS[index % AGENTS.length] ?? null, task: index % 3 ? `PAP-${500 + index} Tarea relacionada` : null, project: null, customer: CUSTOMERS[index % CUSTOMERS.length] ?? null,
      createdAt: "2026-10-23T10:00:00Z", decideBy: index % 9 === 0 ? "2026-10-25T09:00:00Z" : null,
    } satisfies DemoDecision;
  });
}

export const LONG_TEXT_DECISIONS: DemoDecision[] = [
  {
    id: "t1", sourceKind: "approval", severity: "high",
    title: "Aprobar la publicación simultánea de la campaña de lanzamiento del nuevo servicio de rehabilitación deportiva en las seis redes sociales de la asociación y en el boletín quincenal",
    whyNow: "Marta ha preparado 24 piezas (carruseles, reels, historias y textos para el boletín) y la asociación quiere que salgan a la vez el próximo lunes a las 9:00; si no se aprueban antes del viernes a mediodía no habrá tiempo de programarlas en todas las plataformas con la revisión legal que exige el convenio con la universidad.",
    verbs: ["approve", "reject"], agent: "María del Carmen de los Ángeles Fernández-Villaverde (agente de relaciones institucionales)", task: "PAP-731 Campaña de lanzamiento del servicio de rehabilitación deportiva y medicina integrativa", project: null,
    customer: "Asociación Internacional de Profesionales de la Fisioterapia, la Rehabilitación Deportiva y la Medicina Integrativa", createdAt: "2026-10-23T08:00:00Z", decideBy: "2026-10-24T20:00:00Z", bundle: 24,
    preview: { kind: "list", lines: ["Carrusel «Cinco ejercicios para volver a correr sin dolor después de una lesión de rodilla» con los textos revisados por el comité científico", "Reel «Un día en la clínica» con subtítulos en español, valenciano e inglés", "https://www.asociacion-internacional-profesionales-fisioterapia.example.com/campanas/lanzamiento-2026/enlace-muy-largo-sin-espacios-que-no-debe-romper-el-diseño"] },
  },
  {
    id: "t2", sourceKind: "issue_thread_interaction", severity: "medium", title: "🥐 ¿Ponemos «Pan de ayer» o «Pan de siempre»? — Ñandú & Çelik",
    whyNow: "Elige el nombre de la promoción 🍞✨ — الرد مطلوب — 返信が必要です.", verbs: ["answer"], agent: "Nora", task: null, project: null, customer: "🥐 Panadería Ñandú",
    createdAt: "2026-10-23T08:00:00Z", decideBy: null, preview: { kind: "options", lines: ["«Pan de ayer, sabor de siempre»", "«Pan de siempre» (más corto, mejor para el cartel)", "مخبز الأمس — طعم دائم"] },
  },
  {
    id: "t3", sourceKind: "failed_run", severity: "critical", title: "Supercalifragilisticoespialidosoconsultoriaintegraldeserviciosprofesionalesyempresariales no recibió la factura",
    whyNow: "Error: ECONNRESET at TLSSocket.onConnectEnd (node:_tls_wrap:1594:19) at TLSSocket.emit (node:events:531:35) at endReadableNT (node:internal/streams/readable:1696:12)",
    verbs: ["retry"], agent: null, task: null, project: null, customer: null, createdAt: "2026-10-24T02:00:00Z", decideBy: null,
  },
  {
    id: "t4", sourceKind: "review", severity: "low", title: "Ñ", whyNow: "A", verbs: ["review"], agent: "Jo", task: null, project: null, customer: null, createdAt: "2026-10-22T08:00:00Z", decideBy: null,
  },
];

/** Past deadlines: shown in their own "Vencidas" group at the top. */
export const OVERDUE_DECISIONS: DemoDecision[] = [
  {
    id: "o1", sourceKind: "approval", severity: "medium", title: "Aprobar la factura de octubre de Panadería La Espiga",
    whyNow: "La fecha límite era ayer; el cliente ya preguntó dos veces.", verbs: ["approve", "reject"], agent: "Nora (agente de email)", task: "PAP-401 Facturación de octubre", project: null, customer: "Panadería La Espiga",
    createdAt: "2026-10-21T09:00:00Z", decideBy: "2026-10-23T18:00:00Z",
  },
  {
    id: "o2", sourceKind: "issue_thread_interaction", severity: "high", title: "Confirmar la fecha de la sesión de fotos",
    whyNow: "Sin tu respuesta no se puede reservar el estudio; venció hace unas horas.", verbs: ["answer"], agent: "Leo (editor de vídeo)", task: "PAP-410 Sesión de fotos", project: null, customer: "Yoga Bahía",
    createdAt: "2026-10-23T08:00:00Z", decideBy: "2026-10-24T07:00:00Z",
    preview: { kind: "options", lines: ["Martes 28 por la mañana", "Jueves 30 por la tarde (recomendada)", "Dejarlo para noviembre"] },
  },
];

export const WITH_OVERDUE: DemoDecision[] = [...OVERDUE_DECISIONS, ...DEMO_DECISIONS];
export const ONLY_URGENT: DemoDecision[] = DEMO_DECISIONS.filter((decision) => decision.severity === "critical" || decision.severity === "high");
