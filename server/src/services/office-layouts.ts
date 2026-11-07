import { and, eq, ne } from "drizzle-orm";
import { agents, officeLayouts, type Db } from "@paperclipai/db";
import {
  defaultOfficeLayout,
  officeLayoutSchema,
  type OfficeCatalogShape,
  type OfficeLayout,
  type OfficeLayoutResponse,
} from "@paperclipai/shared";
import { logActivity, type LogActivityInput } from "./activity-log.js";

type ActivityActor = Pick<LogActivityInput, "actorType" | "actorId" | "agentId" | "runId" | "agentApiKeyId">;

/**
 * Server-side stand-in for the UI tile catalog (doc/plans/2026-10-21-oficina-pixel-art.md).
 * Only footprints, walkability, seats and theme ids: the server never depends on the art.
 * Kinds and theme ids must stay in sync with ui/public/office/catalog.json.
 */
/**
 * Footprints and seats of ui/public/office/catalog.json, mirrored so the
 * default layout can be built without the UI bundle. A server test compares
 * both files; update this when the catalog changes.
 */
export const OFFICE_SERVER_CATALOG: OfficeCatalogShape = {
  floors: { wood: {}, carpet_red: {} },
  walls: { stone: {} },
  objects: {
    desk: { footprint: { w: 3, h: 1 }, walkable: false, seat: { dx: 1, dy: 1, facing: "up" } },
    chair: { footprint: { w: 1, h: 1 }, walkable: false, seat: { dx: 0, dy: 0, facing: "up" } },
    sofa: { footprint: { w: 2, h: 1 }, walkable: false, seat: { dx: 0, dy: 0, facing: "down" } },
    plant: { footprint: { w: 1, h: 1 }, walkable: false },
    coffee: { footprint: { w: 1, h: 1 }, walkable: false },
    window: { footprint: { w: 1, h: 1 }, walkable: false },
    bookshelf: { footprint: { w: 2, h: 2 }, walkable: false },
    whiteboard: { footprint: { w: 2, h: 1 }, walkable: false },
    lamp: { footprint: { w: 1, h: 1 }, walkable: false },
    printer: { footprint: { w: 2, h: 1 }, walkable: false },
    water_cooler: { footprint: { w: 1, h: 1 }, walkable: false },
  },
};

export function officeLayoutsService(db: Db) {
  async function defaultFor(companyId: string): Promise<OfficeLayout> {
    const rows = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(and(eq(agents.companyId, companyId), ne(agents.status, "terminated")));
    return defaultOfficeLayout(rows, OFFICE_SERVER_CATALOG);
  }

  async function savedRow(companyId: string, userId: string) {
    const [row] = await db
      .select()
      .from(officeLayouts)
      .where(and(eq(officeLayouts.companyId, companyId), eq(officeLayouts.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  return {
    /** The user's saved layout, or the default built from the company's live agents (not persisted). */
    async get(companyId: string, userId: string): Promise<OfficeLayoutResponse> {
      const row = await savedRow(companyId, userId);
      if (row) return { layout: row.layout, source: "saved" };
      return { layout: await defaultFor(companyId), source: "default" };
    },

    async put(companyId: string, userId: string, layoutInput: unknown, actor: ActivityActor): Promise<OfficeLayoutResponse> {
      const layout = officeLayoutSchema.parse(layoutInput);
      const [row] = await db
        .insert(officeLayouts)
        .values({ companyId, userId, layout })
        .onConflictDoUpdate({
          target: [officeLayouts.companyId, officeLayouts.userId],
          set: { layout, updatedAt: new Date() },
        })
        .returning();
      await logActivity(db, {
        ...actor,
        companyId,
        action: "office.layout_updated",
        entityType: "office_layout",
        entityId: row!.id,
        details: { objects: layout.objects.length, cols: layout.cols, rows: layout.rows },
      });
      return { layout, source: "saved" };
    },

    async reset(companyId: string, userId: string, actor: ActivityActor): Promise<OfficeLayoutResponse> {
      const deleted = await db
        .delete(officeLayouts)
        .where(and(eq(officeLayouts.companyId, companyId), eq(officeLayouts.userId, userId)))
        .returning({ id: officeLayouts.id });
      if (deleted.length > 0) {
        await logActivity(db, {
          ...actor,
          companyId,
          action: "office.layout_reset",
          entityType: "office_layout",
          entityId: deleted[0]!.id,
          details: {},
        });
      }
      return { layout: await defaultFor(companyId), source: "default" };
    },
  };
}
