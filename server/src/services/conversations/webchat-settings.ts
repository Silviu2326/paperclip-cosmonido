import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@paperclipai/db";

// Web chat settings for one company (table webchat_settings, pista F).
// Raw SQL on purpose: the table is not exported from packages/db until the integrator adds it.

export interface WebchatSettings {
  active: boolean;
  greeting: string | null;
  brandColor: string | null;
}

export const webchatSettingsInputSchema = z
  .object({
    active: z.boolean(),
    greeting: z
      .string()
      .trim()
      .max(300)
      .nullable()
      .transform((value) => (value && value.length > 0 ? value : null)),
    brandColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Color must be a 6-digit hex value")
      .nullable(),
  })
  .strict();

export type WebchatSettingsInput = z.infer<typeof webchatSettingsInputSchema>;

interface SettingsRow {
  active: boolean;
  greeting: string | null;
  brand_color: string | null;
}

const DISABLED: WebchatSettings = { active: false, greeting: null, brandColor: null };

export function webchatSettingsService(db: Db) {
  async function read(companyId: string): Promise<WebchatSettings> {
    const rows = (await db.execute(sql`
      select active, greeting, brand_color
      from webchat_settings
      where company_id = ${companyId}
      limit 1
    `)) as unknown as SettingsRow[];
    const row = rows[0];
    if (!row) return { ...DISABLED };
    return { active: row.active, greeting: row.greeting, brandColor: row.brand_color };
  }

  return {
    get: read,

    async upsert(companyId: string, input: WebchatSettingsInput): Promise<WebchatSettings> {
      await db.execute(sql`
        insert into webchat_settings (company_id, active, greeting, brand_color)
        values (${companyId}, ${input.active}, ${input.greeting}, ${input.brandColor})
        on conflict (company_id) do update set
          active = excluded.active,
          greeting = excluded.greeting,
          brand_color = excluded.brand_color,
          updated_at = now()
      `);
      return read(companyId);
    },
  };
}
