import { AlertTriangle, Check, CheckCheck, CircleDashed, Clock, Send, X } from "lucide-react";
import type { DeliveryStatus } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/i18n";

// The seven delivery states, each with its own variant and icon so none reads as another.
const STATES: Record<DeliveryStatus, { variant: "default" | "secondary" | "outline" | "destructive"; Icon: typeof Send; dashed?: boolean }> = {
  draft: { variant: "outline", Icon: CircleDashed, dashed: true },
  queued: { variant: "secondary", Icon: Clock },
  sent: { variant: "secondary", Icon: Send },
  delivered: { variant: "secondary", Icon: Check },
  read: { variant: "default", Icon: CheckCheck },
  failed: { variant: "destructive", Icon: X },
  uncertain: { variant: "outline", Icon: AlertTriangle },
};

export function ConversationDeliveryBadge({ status }: { status: DeliveryStatus }) {
  const { t } = useTranslation();
  const { variant, Icon, dashed } = STATES[status];
  return (
    <Badge variant={variant} className={dashed ? "border-dashed" : undefined} data-delivery-status={status}>
      <Icon className="mr-1 h-3 w-3" aria-hidden="true" />
      {t(`conversations.delivery.${status}`)}
    </Badge>
  );
}
