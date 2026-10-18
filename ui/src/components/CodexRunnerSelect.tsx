import type { AgentRunner, AgentRunnerChoice } from "@paperclipai/shared";
import { Field } from "./agent-config-primitives";
import { SelectPopover } from "./ui/select";
import { Button } from "./ui/button";
import { useTranslation } from "@/i18n";

export function CodexRunnerSelect({
  value,
  onChange,
  defaultRunner,
  supportedRunners = ["legacy"],
  disabled,
  pending,
  error,
  onRetry,
}: {
  value: AgentRunnerChoice;
  onChange: (value: AgentRunnerChoice) => void;
  defaultRunner?: AgentRunner;
  supportedRunners?: readonly AgentRunner[];
  disabled?: boolean;
  pending?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t("codexRunner.label")}>
      <SelectPopover
        aria-label={t("codexRunner.label")}
        disabled={disabled}
        value={value}
        displayValue={value === "auto" ? (defaultRunner ? `${defaultRunner === "paperclip" ? "Paperclip Runner" : t("codexRunner.legacyRunner")}${t("codexRunner.defaultSuffix")}` : pending ? t("codexRunner.checking") : t("codexRunner.automaticUnavailable")) : undefined}
        onValueChange={next => onChange(next as AgentRunnerChoice)}
        options={[
          { value: "paperclip", label: `Paperclip Runner${defaultRunner === "paperclip" ? t("codexRunner.defaultSuffix") : ""}`, disabled: !supportedRunners.includes("paperclip") && value !== "paperclip" },
          { value: "legacy", label: `${t("codexRunner.legacyRunner")}${defaultRunner === "legacy" ? t("codexRunner.defaultSuffix") : ""}`, disabled: !supportedRunners.includes("legacy") && value !== "legacy" },
        ]}
      />
      {error && <div className="mt-2 space-y-2">
        <p role="alert" className="text-sm text-destructive">{error}</p>
        {onRetry && <Button type="button" variant="outline" size="sm" disabled={pending || disabled} onClick={onRetry}>{t("codexRunner.retry")}</Button>}
      </div>}
    </Field>
  );
}
