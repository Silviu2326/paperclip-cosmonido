import { useDraggable, useDroppable, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SALES_STAGE_KEYS, type Opportunity, type SalesStageKey } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { cn } from "../../lib/utils";
import { NativeSelect } from "@/components/ui/select";

export function formatOpportunityAmount(amountCents: number | null, currency: string | null) {
  if (amountCents === null) return null;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currency ?? "EUR" }).format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency ?? ""}`.trim();
  }
}

/** An open opportunity whose next action date has passed. */
export function isNextActionOverdue(opportunity: Opportunity, now: number = Date.now()) {
  if (opportunity.status !== "open" || !opportunity.nextActionAt) return false;
  const due = new Date(opportunity.nextActionAt).getTime();
  return !Number.isNaN(due) && due < now;
}

interface BoardProps {
  items: Opportunity[];
  disabled?: boolean;
  onOpen: (opportunity: Opportunity) => void;
  onMove: (opportunity: Opportunity, stageKey: SalesStageKey) => void;
}

/** Kanban by sales stage. Drag a card onto a column, or pick the stage on the card (keyboard path). */
export function OpportunityBoard({ items, disabled, onOpen, onMove }: BoardProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const opportunity = items.find((item) => item.id === event.active.id);
    const target = event.over?.id as SalesStageKey | undefined;
    if (!opportunity || !target || opportunity.stageKey === target) return;
    onMove(opportunity, target);
  };

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {SALES_STAGE_KEYS.map((stageKey) => (
          <StageColumn
            key={stageKey}
            stageKey={stageKey}
            items={items.filter((item) => item.stageKey === stageKey)}
            disabled={disabled}
            onOpen={onOpen}
            onMove={onMove}
          />
        ))}
      </div>
    </DndContext>
  );
}

function StageColumn({
  stageKey,
  items,
  disabled,
  onOpen,
  onMove,
}: {
  stageKey: SalesStageKey;
  items: Opportunity[];
  disabled?: boolean;
  onOpen: (opportunity: Opportunity) => void;
  onMove: (opportunity: Opportunity, stageKey: SalesStageKey) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: stageKey, disabled });
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`crm.opportunities.stages.${stageKey}`)}
      className={cn(
        "flex w-64 shrink-0 flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2",
        isOver && "ring-2 ring-ring",
      )}
    >
      <header className="flex items-center justify-between px-1 text-sm font-medium">
        <span>{t(`crm.opportunities.stages.${stageKey}`)}</span>
        <span className="text-muted-foreground">{items.length}</span>
      </header>
      {items.length === 0 && <p className="px-1 text-sm text-muted-foreground">{t("crm.opportunities.columnEmpty")}</p>}
      {items.map((item) => (
        <OpportunityCard key={item.id} opportunity={item} disabled={disabled} onOpen={onOpen} onMove={onMove} />
      ))}
    </section>
  );
}

function OpportunityCard({
  opportunity,
  disabled,
  onOpen,
  onMove,
}: {
  opportunity: Opportunity;
  disabled?: boolean;
  onOpen: (opportunity: Opportunity) => void;
  onMove: (opportunity: Opportunity, stageKey: SalesStageKey) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: opportunity.id,
    disabled,
  });
  const amount = formatOpportunityAmount(opportunity.amountCents, opportunity.currency);
  const owner = opportunity.ownerUserId ?? opportunity.ownerAgentId;
  const overdue = isNextActionOverdue(opportunity);
  return (
    <article
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn("flex flex-col gap-2 rounded-md border border-border bg-card p-3 shadow-xs", isDragging && "opacity-60")}
    >
      <button
        type="button"
        className="flex cursor-grab flex-col items-start gap-1 text-left"
        onClick={() => onOpen(opportunity)}
        {...attributes}
        {...listeners}
      >
        <span className="text-sm font-medium">{opportunity.title}</span>
        {amount && <span className="text-sm">{amount}</span>}
        <span className={cn("text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
          {opportunity.nextAction
            ? `${t("crm.opportunities.nextAction")}: ${opportunity.nextAction}`
            : t("crm.opportunities.noNextAction")}
          {overdue && ` · ${t("crm.opportunities.overdue", { defaultValue: "Overdue" })}`}
        </span>
        <span className="text-xs text-muted-foreground">
          {owner ? `${t("crm.opportunities.owner")}: ${owner}` : t("crm.opportunities.noOwner")}
        </span>
      </button>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {t("crm.opportunities.moveTo")}
        <NativeSelect
          value={opportunity.stageKey ?? ""}
          disabled={disabled}
          onChange={(event) => onMove(opportunity, event.target.value as SalesStageKey)}
        >
          {SALES_STAGE_KEYS.map((key) => (
            <option key={key} value={key}>
              {t(`crm.opportunities.stages.${key}`)}
            </option>
          ))}
        </NativeSelect>
      </label>
    </article>
  );
}
