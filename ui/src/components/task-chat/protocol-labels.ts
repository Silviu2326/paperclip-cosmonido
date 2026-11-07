import { t } from "@/i18n";

/** Localized label for a runtime/protocol status value; unknown values fall back to the raw text. */
export function statusLabel(status: string): string {
  return t(`chatUiWork.status_${status}`, { defaultValue: status.replaceAll("_", " ") });
}

/** Localized label for a workspace file operation (create, modify, ...). */
export function operationLabel(operation: string): string {
  return t(`chatUiWork.operation_${operation}`, { defaultValue: operation.replaceAll("_", " ") });
}
