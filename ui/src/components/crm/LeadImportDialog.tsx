import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import {
  leadsApi,
  type CsvImportResult,
  type CsvLeadField,
  type CsvPreview,
} from "../../api/leads";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const CSV_FIELDS: CsvLeadField[] = ["name", "email", "phone", "company", "language", "message", "sourceRef"];
const MAX_CSV_BYTES = 5_000_000;

interface LeadImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onImported?: () => void;
}

export function LeadImportDialog({ open, onOpenChange, companyId, onImported }: LeadImportDialogProps) {
  const { t } = useTranslation();
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Partial<Record<CsvLeadField, string>>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const body = () => {
    const mapping = Object.fromEntries(Object.entries(overrides).filter(([, value]) => value)) as Partial<Record<CsvLeadField, string>>;
    return { csv: csv ?? "", mapping: Object.keys(mapping).length ? mapping : undefined, skipDuplicates };
  };

  const previewMutation = useMutation({
    mutationFn: () => leadsApi.previewCsv(companyId, body()),
    onSuccess: (data) => {
      setPreview(data);
      setResult(null);
    },
  });

  const importMutation = useMutation({
    mutationFn: () => leadsApi.importCsv(companyId, body()),
    onSuccess: (data) => {
      setResult(data);
      onImported?.();
    },
  });

  const reset = () => {
    setCsv(null);
    setFileName("");
    setFileError(null);
    setOverrides({});
    setSkipDuplicates(true);
    setPreview(null);
    setResult(null);
    previewMutation.reset();
    importMutation.reset();
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      setFileError(t("crm.leads.import.tooLarge"));
      return;
    }
    const text = await file.text();
    setFileError(null);
    setFileName(file.name);
    setCsv(text);
    setOverrides({});
    setResult(null);
    setPreview(null);
    // Preview right away so the user sees the mapping and duplicates before confirming.
    previewMutation.mutate(undefined, {
      onError: () => undefined,
    });
  };

  // previewMutation reads csv from state at call time, so trigger it after the state is set.
  const runPreview = (nextOverrides: Partial<Record<CsvLeadField, string>>, nextSkip: boolean) => {
    if (!csv) return;
    setOverrides(nextOverrides);
    setSkipDuplicates(nextSkip);
    setResult(null);
    previewMutation.mutate();
  };

  const error = (previewMutation.error ?? importMutation.error) as Error | null;
  const canImport = Boolean(preview && preview.totals.ready + (skipDuplicates ? 0 : preview.totals.duplicate) > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("crm.leads.import.title")}</DialogTitle>
          <DialogDescription>{t("crm.leads.import.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label={t("crm.leads.import.file")}
            className="text-sm"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
          {fileError && <p className="text-sm text-destructive">{fileError}</p>}

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CSV_FIELDS.map((field) => (
                  <label key={field} className="space-y-1 text-xs">
                    <span className="text-muted-foreground">{t(`crm.leads.import.fields.${field}`)}</span>
                    <NativeSelect
                      className="w-full"
                      value={overrides[field] ?? preview.mapping[field] ?? ""}
                      onChange={(event) => runPreview({ ...overrides, [field]: event.target.value }, skipDuplicates)}
                    >
                      <option value="">{t("crm.leads.import.notMapped")}</option>
                      {preview.headers.map((header) => (
                        <option key={header} value={header}>{header}</option>
                      ))}
                    </NativeSelect>
                  </label>
                ))}
              </div>

              <p className="text-sm">
                {t("crm.leads.import.totals", {
                  rows: preview.totals.rows,
                  ready: preview.totals.ready,
                  duplicate: preview.totals.duplicate,
                  invalid: preview.totals.invalid,
                  known: preview.totals.knownContacts,
                })}
              </p>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={skipDuplicates}
                  onCheckedChange={(checked) => runPreview(overrides, checked === true)}
                  aria-label={t("crm.leads.import.skipDuplicates")}
                />
                {t("crm.leads.import.skipDuplicates")}
              </label>

              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-2 py-1.5 font-medium">{t("crm.leads.import.columns.line")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("crm.leads.import.columns.name")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("crm.leads.import.columns.identity")}</th>
                      <th className="px-2 py-1.5 font-medium">{t("crm.leads.import.columns.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={row.line} className="border-t border-border">
                        <td className="px-2 py-1">{row.line}</td>
                        <td className="px-2 py-1">{row.values.name ?? row.values.company ?? "-"}</td>
                        <td className="px-2 py-1">{row.values.email ?? row.values.phone ?? "-"}</td>
                        <td className="px-2 py-1">
                          {row.status === "ready" && t("crm.leads.import.rowStatus.ready")}
                          {row.status === "duplicate" && (row.duplicateReason === "in_file"
                            ? t("crm.leads.import.rowStatus.duplicateInFile")
                            : t("crm.leads.import.rowStatus.duplicateExisting"))}
                          {row.status === "invalid" && `${t("crm.leads.import.rowStatus.invalid")}: ${row.errors.join(", ")}`}
                          {row.knownContact && row.status !== "invalid" && (
                            <span className="ml-1 text-muted-foreground">({t("crm.leads.import.knownContact")})</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.totals.rows > preview.rows.length && (
                <p className="text-xs text-muted-foreground">
                  {t("crm.leads.import.previewLimit", { shown: preview.rows.length, total: preview.totals.rows })}
                </p>
              )}
            </>
          )}

          {result && (
            <p className="text-sm">
              {t("crm.leads.import.result", { imported: result.imported, skipped: result.skipped })}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error.message}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {result ? t("crm.leads.actions.close") : t("crm.leads.actions.cancel")}
          </Button>
          {preview && !result && (
            <Button type="button" disabled={!canImport || importMutation.isPending} onClick={() => importMutation.mutate()}>
              {t("crm.leads.import.confirm")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
