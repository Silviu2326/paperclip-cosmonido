import type { ConversationChannel } from "@paperclipai/shared";
import { Camera, Globe, Mail, MessageCircle, MessagesSquare, Phone, Send, Smartphone } from "lucide-react";
import { useTranslation } from "@/i18n";

const channels = {
  whatsapp: { Icon: MessageCircle, color: "text-chart-2" },
  email: { Icon: Mail, color: "text-chart-1" },
  telegram: { Icon: Send, color: "text-chart-3" },
  messenger: { Icon: MessagesSquare, color: "text-chart-4" },
  instagram: { Icon: Camera, color: "text-chart-5" },
  webchat: { Icon: Globe, color: "text-primary" },
  sms: { Icon: Smartphone, color: "text-chart-1" },
  voice: { Icon: Phone, color: "text-muted-foreground" },
};

export function ChannelLabel({ channel }: { channel: ConversationChannel }) {
  const { t } = useTranslation();
  const { Icon, color } = channels[channel];
  return <span className="inline-flex items-center gap-1 text-xs"><Icon aria-hidden="true" className={`size-4 ${color}`} />{t(`conversations.channel.${channel}`)}</span>;
}
