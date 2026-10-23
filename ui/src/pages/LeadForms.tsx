import { useEffect, useState } from "react";
import { Copy, FileText, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LEAD_FORM_DEFAULT_FIELDS,
  LEAD_FORM_FIELD_KEYS,
  type LeadForm,
  type LeadFormDetail,
  type LeadFormField,
  type LeadFormLifecycleAction,
  type LeadFormStatusFilter,
} from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { leadFormsApi } from "../api/lead-forms";
import { ApiError } from "../api/client";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Lead forms (S80). The editor writes the same field list the public route parses
// (services/leads/lead-forms.ts), so what is shown here is what the form accepts.
// Every save sends the updatedAt it loaded; a 409 asks the user to reload.

type OptionalField = Exclude<LeadFormField, "name">;

const OPTIONAL_FIELDS = LEAD_FORM_FIELD_KEYS.filter((key): key is OptionalField => key !== "name");

const FIELD_LABELS: Record<OptionalField, string> = {
  email: "Email",
  phone: "Phone",
  company: "Company",
  message: "Message",
  consent: "Consent checkbox",
};

function toggleField(fields: LeadFormField[], key: LeadFormField, on: boolean): LeadFormField[] {
  const set = new Set<LeadFormField>(fields);
  if (on) set.add(key);
  else set.delete(key);
  return LEAD_FORM_FIELD_KEYS.filter((candidate) => set.has(candidate));
}

function hasContactField(fields: LeadFormField[]): boolean {
  return fields.includes("email") || fields.includes("phone");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409;
}

function FieldChecklist({
  idPrefix,
  fields,
  onChange,
  label,
  contactHint,
}: {
  idPrefix: string;
  fields: LeadFormField[];
  onChange: (next: LeadFormField[]) => void;
  label: string;
  contactHint: string;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <div className="flex items-center gap-2">
        <Checkbox id={`${idPrefix}-name`} checked disabled />
        <Label htmlFor={`${idPrefix}-name`}>Name</Label>
      </div>
      {OPTIONAL_FIELDS.map((key) => (
        <div key={key} className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-${key}`}
            checked={fields.includes(key)}
            onCheckedChange={(checked) => onChange(toggleField(fields, key, checked === true))}
          />
          <Label htmlFor={`${idPrefix}-${key}`}>{FIELD_LABELS[key]}</Label>
        </div>
      ))}
      {!hasContactField(fields) && <p className="text-sm text-destructive">{contactHint}</p>}
    </fieldset>
  );
}

function CreateLeadFormDialog({
  open,
  onOpenChange,
  companyId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated: (form: LeadFormDetail) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [fields, setFields] = useState<LeadFormField[]>(LEAD_FORM_DEFAULT_FIELDS);
  const [sourceLabel, setSourceLabel] = useState("");
  const [consentText, setConsentText] = useState("");

  const trimmedName = name.trim();
  const hasConsent = fields.includes("consent");
  const valid = trimmedName.length > 0 && hasContactField(fields) && (!hasConsent || consentText.trim().length > 0);

  const createMutation = useMutation({
    mutationFn: () =>
      leadFormsApi.create(companyId, {
        name: trimmedName,
        fields,
        settings: { sourceLabel: sourceLabel.trim() || null, consentText: consentText.trim() || null },
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["lead-forms", companyId] });
      setName("");
      setFields(LEAD_FORM_DEFAULT_FIELDS);
      setSourceLabel("");
      setConsentText("");
      onOpenChange(false);
      onCreated(created);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("crm.leadForms.create.title", { defaultValue: "New lead form" })}</DialogTitle>
          <DialogDescription>
            {t("crm.leadForms.create.description", {
              defaultValue: "The public address is created with the form and stays the same if you rename it. Publish it when it is ready to receive leads.",
            })}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && !createMutation.isPending) createMutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="lf-create-name">{t("crm.leadForms.fields.name", { defaultValue: "Name" })}</Label>
            <Input id="lf-create-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
          </div>
          <FieldChecklist
            idPrefix="lf-create"
            fields={fields}
            onChange={setFields}
            label={t("crm.leadForms.fields.title", { defaultValue: "Fields" })}
            contactHint={t("crm.leadForms.fields.contactRequired", { defaultValue: "Enable email or phone so the lead can be contacted." })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="lf-create-source">{t("crm.leadForms.settings.sourceLabel", { defaultValue: "Source label" })}</Label>
            <Input id="lf-create-source" value={sourceLabel} maxLength={80} onChange={(event) => setSourceLabel(event.target.value)} />
          </div>
          {hasConsent && (
            <div className="space-y-1.5">
              <Label htmlFor="lf-create-consent">{t("crm.leadForms.settings.consentText", { defaultValue: "Consent text" })}</Label>
              <Textarea id="lf-create-consent" value={consentText} maxLength={1000} onChange={(event) => setConsentText(event.target.value)} />
            </div>
          )}
          {createMutation.error && <p className="text-sm text-destructive">{errorMessage(createMutation.error)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t("common.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button type="submit" disabled={!valid || createMutation.isPending}>
              {t("crm.leadForms.create.submit", { defaultValue: "Create form" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LeadFormEditorBody({ companyId, form, onClose }: { companyId: string; form: LeadFormDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(form.name);
  const [fields, setFields] = useState<LeadFormField[]>(form.fields);
  const [sourceLabel, setSourceLabel] = useState(form.settings.sourceLabel ?? "");
  const [consentText, setConsentText] = useState(form.settings.consentText ?? "");
  const [copied, setCopied] = useState<"url" | "embed" | null>(null);

  const trimmedName = name.trim();
  const hasConsent = fields.includes("consent");
  const dirty =
    trimmedName !== form.name ||
    fields.join(",") !== form.fields.join(",") ||
    sourceLabel.trim() !== (form.settings.sourceLabel ?? "") ||
    consentText.trim() !== (form.settings.consentText ?? "");
  const canSave =
    dirty && trimmedName.length > 0 && hasContactField(fields) && (!hasConsent || consentText.trim().length > 0);

  // The body is keyed by updatedAt, so a saved or reloaded row replaces the draft with server state.
  const applySaved = (saved: LeadFormDetail) => {
    queryClient.setQueryData(["lead-forms", "detail", saved.id], saved);
    queryClient.invalidateQueries({ queryKey: ["lead-forms", companyId] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      leadFormsApi.update(form.id, {
        expectedUpdatedAt: form.updatedAt,
        name: trimmedName,
        fields,
        settings: { sourceLabel: sourceLabel.trim() || null, consentText: consentText.trim() || null },
      }),
    onSuccess: applySaved,
  });

  const lifecycleMutation = useMutation({
    mutationFn: (action: LeadFormLifecycleAction) => leadFormsApi.lifecycle(form.id, action, form.updatedAt),
    onSuccess: applySaved,
  });

  const mutationError = saveMutation.error ?? lifecycleMutation.error;
  const conflict = isConflict(mutationError);

  const reload = () => {
    saveMutation.reset();
    lifecycleMutation.reset();
    queryClient.invalidateQueries({ queryKey: ["lead-forms", "detail", form.id] });
  };

  const discard = () => {
    setName(form.name);
    setFields(form.fields);
    setSourceLabel(form.settings.sourceLabel ?? "");
    setConsentText(form.settings.consentText ?? "");
  };

  const copy = (value: string, kind: "url" | "embed") => {
    // The clipboard API is missing outside secure contexts; the value stays visible for manual copy.
    if (!navigator.clipboard) {
      setCopied(null);
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => setCopied(kind),
      () => setCopied(null),
    );
  };

  const lifecyclePending = lifecycleMutation.isPending;
  // Lifecycle changes reload the row and would drop unsaved edits, so they wait for a save or discard.
  const lifecycleBlocked = dirty || lifecyclePending || saveMutation.isPending;

  return (
    <section className="space-y-4 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-medium">{form.name}</h2>
          <Badge variant="outline">{form.active ? t("crm.leadForms.status.active", { defaultValue: "Active" }) : t("crm.leadForms.status.archived", { defaultValue: "Archived" })}</Badge>
          <Badge variant="outline">{form.published ? t("crm.leadForms.status.published", { defaultValue: "Published" }) : t("crm.leadForms.status.draft", { defaultValue: "Draft" })}</Badge>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t("crm.leadForms.actions.close", { defaultValue: "Close" })}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {form.active && !form.published && (
          <Button size="sm" disabled={lifecycleBlocked} onClick={() => lifecycleMutation.mutate("publish")}>
            {t("crm.leadForms.actions.publish", { defaultValue: "Publish" })}
          </Button>
        )}
        {form.published && (
          <Button size="sm" variant="outline" disabled={lifecycleBlocked} onClick={() => lifecycleMutation.mutate("unpublish")}>
            {t("crm.leadForms.actions.unpublish", { defaultValue: "Unpublish" })}
          </Button>
        )}
        {form.active && (
          <Button size="sm" variant="ghost" disabled={lifecycleBlocked} onClick={() => lifecycleMutation.mutate("archive")}>
            {t("crm.leadForms.actions.archive", { defaultValue: "Archive" })}
          </Button>
        )}
        {!form.active && (
          <Button size="sm" variant="outline" disabled={lifecycleBlocked} onClick={() => lifecycleMutation.mutate("restore")}>
            {t("crm.leadForms.actions.restore", { defaultValue: "Restore" })}
          </Button>
        )}
      </div>
      {dirty && (
        <p className="text-sm text-muted-foreground">
          {t("crm.leadForms.unsaved", { defaultValue: "Save or discard your changes before publishing or archiving." })}
        </p>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="lf-edit-name">{t("crm.leadForms.fields.name", { defaultValue: "Name" })}</Label>
        <Input id="lf-edit-name" value={name} maxLength={120} onChange={(event) => setName(event.target.value)} />
      </div>
      <FieldChecklist
        idPrefix="lf-edit"
        fields={fields}
        onChange={setFields}
        label={t("crm.leadForms.fields.title", { defaultValue: "Fields" })}
        contactHint={t("crm.leadForms.fields.contactRequired", { defaultValue: "Enable email or phone so the lead can be contacted." })}
      />
      <div className="space-y-1.5">
        <Label htmlFor="lf-edit-source">{t("crm.leadForms.settings.sourceLabel", { defaultValue: "Source label" })}</Label>
        <Input id="lf-edit-source" value={sourceLabel} maxLength={80} onChange={(event) => setSourceLabel(event.target.value)} />
        <p className="text-sm text-muted-foreground">
          {t("crm.leadForms.settings.sourceHint", { defaultValue: "Recorded on every lead from this form." })}
        </p>
      </div>
      {hasConsent && (
        <div className="space-y-1.5">
          <Label htmlFor="lf-edit-consent">{t("crm.leadForms.settings.consentText", { defaultValue: "Consent text" })}</Label>
          <Textarea id="lf-edit-consent" value={consentText} maxLength={1000} onChange={(event) => setConsentText(event.target.value)} />
        </div>
      )}

      {mutationError && (
        <div className="space-y-2">
          <p className="text-sm text-destructive">{errorMessage(mutationError)}</p>
          {conflict && (
            <Button size="sm" variant="outline" onClick={reload}>
              {t("crm.leadForms.actions.reload", { defaultValue: "Reload form" })}
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" disabled={!dirty || saveMutation.isPending} onClick={discard}>
          {t("crm.leadForms.actions.discard", { defaultValue: "Discard changes" })}
        </Button>
        <Button disabled={!canSave || saveMutation.isPending || conflict} onClick={() => saveMutation.mutate()}>
          {t("crm.leadForms.actions.save", { defaultValue: "Save changes" })}
        </Button>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("crm.leadForms.publicUrl", { defaultValue: "Public address" })}</p>
          <Button size="sm" variant="ghost" onClick={() => copy(form.publicUrl, "url")}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {copied === "url"
              ? t("crm.leadForms.actions.copied", { defaultValue: "Copied" })
              : t("crm.leadForms.actions.copy", { defaultValue: "Copy" })}
          </Button>
        </div>
        <code className="block break-all text-xs">{form.publicUrl}</code>
        {!form.published && (
          <p className="text-sm text-muted-foreground">
            {t("crm.leadForms.notPublished", { defaultValue: "Not published: this address does not accept submissions yet." })}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("crm.leadForms.embed", { defaultValue: "Embed snippet" })}</p>
          <Button size="sm" variant="ghost" onClick={() => copy(form.embedHtml, "embed")}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            {copied === "embed"
              ? t("crm.leadForms.actions.copied", { defaultValue: "Copied" })
              : t("crm.leadForms.actions.copy", { defaultValue: "Copy" })}
          </Button>
        </div>
        <Textarea readOnly rows={10} value={form.embedHtml} className="font-mono text-xs" aria-label="Embed snippet" />
        <p className="text-sm text-muted-foreground">
          {t("crm.leadForms.embedHint", {
            defaultValue: "A plain HTML form that posts to the address above. The browser then shows the server's JSON acknowledgement.",
          })}
        </p>
      </div>
    </section>
  );
}

function LeadFormEditor({ companyId, formId, onClose }: { companyId: string; formId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const detailQuery = useQuery({
    queryKey: ["lead-forms", "detail", formId],
    queryFn: () => leadFormsApi.get(formId),
    // Background refetches would replace an unsaved draft; the editor reloads explicitly instead.
    refetchOnWindowFocus: false,
  });

  if (detailQuery.isLoading) return <PageSkeleton variant="list" />;
  if (detailQuery.error || !detailQuery.data) {
    return (
      <p className="text-sm text-destructive">
        {detailQuery.error ? errorMessage(detailQuery.error) : t("crm.leadForms.notFound", { defaultValue: "Lead form not found" })}
      </p>
    );
  }
  return <LeadFormEditorBody key={detailQuery.data.updatedAt} companyId={companyId} form={detailQuery.data} onClose={onClose} />;
}

export function LeadForms() {
  const { selectedCompanyId } = useCompany();
  const { t, i18n } = useTranslation();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [status, setStatus] = useState<LeadFormStatusFilter>("active");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const title = t("crm.leadForms.title", { defaultValue: "Lead forms" });

  useEffect(() => {
    setBreadcrumbs([{ label: title }]);
  }, [setBreadcrumbs, title]);

  // A form from the previous company is not visible here; drop the selection on switch.
  useEffect(() => {
    setSelectedId(null);
  }, [selectedCompanyId]);

  const listQuery = useQuery({
    queryKey: ["lead-forms", selectedCompanyId, status, search.trim()],
    queryFn: () => leadFormsApi.list(selectedCompanyId!, { status, q: search.trim() || undefined, limit: 50 }),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={FileText}
        message={t("crm.leadForms.selectCompany", { defaultValue: "Select a company to manage its lead forms." })}
      />
    );
  }

  const forms: LeadForm[] = listQuery.data?.items ?? [];
  const dateFormat = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            className="w-56"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("crm.leadForms.filters.search", { defaultValue: "Search by name" })}
            aria-label={t("crm.leadForms.filters.search", { defaultValue: "Search by name" })}
          />
          <NativeSelect
            value={status}
            onChange={(event) => setStatus(event.target.value as LeadFormStatusFilter)}
            aria-label={t("crm.leadForms.filters.status", { defaultValue: "Status" })}
          >
            <option value="active">{t("crm.leadForms.status.active", { defaultValue: "Active" })}</option>
            <option value="archived">{t("crm.leadForms.status.archived", { defaultValue: "Archived" })}</option>
            <option value="all">{t("crm.leadForms.filters.all", { defaultValue: "All" })}</option>
          </NativeSelect>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {t("crm.leadForms.actions.new", { defaultValue: "New form" })}
        </Button>
      </div>

      {listQuery.isLoading && <PageSkeleton variant="list" />}
      {listQuery.error && <p className="text-sm text-destructive">{errorMessage(listQuery.error)}</p>}

      {listQuery.data && forms.length === 0 && (
        <EmptyState
          icon={FileText}
          message={
            search.trim()
              ? t("crm.leadForms.emptyFiltered", { defaultValue: "No forms match this search." })
              : t("crm.leadForms.empty", { defaultValue: "No lead forms yet. Create one to start capturing leads." })
          }
        />
      )}

      {forms.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">{t("crm.leadForms.columns.name", { defaultValue: "Name" })}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leadForms.columns.slug", { defaultValue: "Address" })}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leadForms.columns.status", { defaultValue: "Status" })}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leadForms.columns.publication", { defaultValue: "Publication" })}</th>
                <th className="px-3 py-2 font-medium">{t("crm.leadForms.columns.updated", { defaultValue: "Updated" })}</th>
              </tr>
            </thead>
            <tbody>
              {forms.map((form) => (
                <tr key={form.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      aria-pressed={selectedId === form.id}
                      onClick={() => setSelectedId(form.id)}
                    >
                      {form.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{form.slug}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">
                      {form.active
                        ? t("crm.leadForms.status.active", { defaultValue: "Active" })
                        : t("crm.leadForms.status.archived", { defaultValue: "Archived" })}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">
                      {form.published
                        ? t("crm.leadForms.status.published", { defaultValue: "Published" })
                        : t("crm.leadForms.status.draft", { defaultValue: "Draft" })}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{dateFormat.format(new Date(form.updatedAt))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {listQuery.data?.nextCursor && (
        <p className="text-sm text-muted-foreground">
          {t("crm.leadForms.truncated", { defaultValue: "Showing the 50 most recently changed forms. Search by name to find others." })}
        </p>
      )}

      {selectedId && (
        <LeadFormEditor key={selectedId} companyId={selectedCompanyId} formId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      <CreateLeadFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        companyId={selectedCompanyId}
        onCreated={(created) => setSelectedId(created.id)}
      />
    </div>
  );
}
