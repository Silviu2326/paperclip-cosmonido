import type { Customer } from "@paperclipai/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "@/i18n";

export const customerDetailFields = [
  { key: "contactName", label: "crm.customers.fieldContactName", maxLength: 200, type: "text" },
  { key: "contactEmail", label: "crm.customers.fieldContactEmail", maxLength: 320, type: "email" },
  { key: "phone", label: "crm.customers.fieldPhone", maxLength: 64, type: "tel" },
  { key: "address", label: "crm.customers.fieldAddress", maxLength: 500, type: "text" },
  { key: "city", label: "crm.customers.fieldCity", maxLength: 120, type: "text" },
  { key: "postalCode", label: "crm.customers.fieldPostalCode", maxLength: 32, type: "text" },
  { key: "country", label: "crm.customers.fieldCountry", maxLength: 120, type: "text" },
  { key: "legalName", label: "crm.customers.fieldLegalName", maxLength: 200, type: "text" },
  { key: "taxId", label: "crm.customers.fieldTaxId", maxLength: 80, type: "text" },
] as const;

export type CustomerDetailValues = Record<(typeof customerDetailFields)[number]["key"], string>;

export function customerDetailValues(customer?: Customer): CustomerDetailValues {
  return Object.fromEntries(customerDetailFields.map(({ key }) => [key, customer?.[key] ?? ""])) as CustomerDetailValues;
}

export function CustomerDetailsFields({ values, onChange }: {
  values: CustomerDetailValues;
  onChange: (key: keyof CustomerDetailValues, value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {customerDetailFields.map(({ key, label, maxLength, type }) => (
        <div key={key} className="space-y-1.5">
          <Label htmlFor={`customer-create-${key}`}>{t(label)}</Label>
          <Input
            id={`customer-create-${key}`}
            type={type}
            maxLength={maxLength}
            value={values[key]}
            onChange={(event) => onChange(key, event.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

