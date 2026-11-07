import { useTranslation } from "@/i18n";
import type { ConversationFilters as Filters } from "../../api/conversations";

const STATUSES = ["open", "waiting_us", "waiting_them", "closed"] as const;
const CHANNELS = ["email", "whatsapp", "messenger", "instagram", "telegram", "webchat", "voice", "sms"] as const;

const selectClass = "rounded-md border border-border bg-background px-2 py-1 text-sm";

export function ConversationFilterBar({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (next: Filters) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      <label className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">{t("conversations.filters.status")}</span>
        <select
          className={selectClass}
          value={value.status ?? ""}
          onChange={(e) => onChange({ ...value, status: e.target.value || undefined })}
        >
          <option value="">{t("conversations.filters.any")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(`conversations.status.${s}`)}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">{t("conversations.filters.channel")}</span>
        <select
          className={selectClass}
          value={value.channel ?? ""}
          onChange={(e) => onChange({ ...value, channel: e.target.value || undefined })}
        >
          <option value="">{t("conversations.filters.channelAll")}</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>{t(`conversations.channel.${c}`)}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1 text-sm">
        <span className="text-muted-foreground">{t("conversations.filters.assigned")}</span>
        <select
          className={selectClass}
          value={value.assigned ?? ""}
          onChange={(e) => onChange({ ...value, assigned: e.target.value || undefined })}
        >
          <option value="">{t("conversations.filters.any")}</option>
          <option value="none">{t("conversations.filters.unassigned")}</option>
        </select>
      </label>
    </div>
  );
}
