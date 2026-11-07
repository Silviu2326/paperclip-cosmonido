import { motion } from "motion/react";
import type { Agent } from "@paperclipai/shared";
import { AgentAvatar } from "@/components/AgentAvatar";
import { useMotionTokens } from "@/hooks/useMotionTokens";
import { useTranslation } from "@/i18n";

/** First screen of a conversation with an agent that has not said anything yet. */
export function AgentGreeting({ agent }: { agent: Pick<Agent, "id" | "name" | "role" | "title" | "appearance"> }) {
  const { t } = useTranslation();
  const tokens = useMotionTokens();
  const role = agent.title ?? agent.role;
  return (
    <div className="flex flex-col items-center justify-center gap-5 px-6 py-16 text-center" data-testid="agent-greeting">
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: tokens.slow, ease: tokens.easeOut }}
      >
        <AgentAvatar agent={agent} size={64} />
      </motion.div>
      <div>
        <h2 className="text-lg font-semibold" style={{ fontFamily: "var(--font-heading)" }}>
          {t("agentChat.greetingTitle", { name: agent.name, defaultValue: "Habla con {{name}}" })}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("agentChat.greetingText", { role, defaultValue: "{{role}}. Cuéntale qué necesitas y creará los encargos por ti." })}
        </p>
      </div>
    </div>
  );
}
