import type { Meta, StoryObj } from "@storybook/react-vite";
import { Context } from "@/pages/Context";
import { prepareFixtureApi, type FixtureRoute } from "../../support/capability-gaps/api";

const COMPANY_ID = "company-storybook";

const files = [
  { id: "file-offer-01", name: "Oferta-primavera.pdf", contentType: "application/pdf", audienceKind: "company", audienceId: null, validUntil: "2099-01-01T00:00:00Z", contextRole: "offer", currentVersionId: "v1" },
  { id: "file-brand-01", name: "Guia-de-estilo.md", contentType: "text/markdown", audienceKind: "company", audienceId: null, validUntil: null, contextRole: "brand", currentVersionId: "v1" },
  { id: "file-procedure-01", name: "Procedimiento-entregas.md", contentType: "text/markdown", audienceKind: "company", audienceId: null, validUntil: null, contextRole: "procedure", currentVersionId: "v1" },
  { id: "file-customer-01", name: "Cliente-ejemplo-brief.md", contentType: "text/markdown", audienceKind: "project", audienceId: "project-storybook", validUntil: "2000-01-01T00:00:00Z", contextRole: "customer", currentVersionId: "v1" },
];

function contextRoutes(list: (roles: string | null) => unknown): FixtureRoute[] {
  return [
    {
      path: `/api/companies/${COMPANY_ID}/context`,
      read: ({ url }) => list(url.searchParams.get("roles")),
    },
    {
      path: `/api/companies/${COMPANY_ID}/projects`,
      read: () => [{ id: "project-storybook", companyId: COMPANY_ID, name: "Campaña de primavera" }],
    },
  ];
}

const meta = {
  id: "feature-context-roles",
  title: "Documents and artifacts/Business context/Context roles",
  component: Context,
  parameters: {
    layout: "padded",
  },
  beforeEach: ({ parameters }) => {
    const mode = parameters.contextMode ?? "ready";
    const routes = contextRoutes((roles) => {
      if (mode === "empty") return { folders: [], files: [], truncated: false };
      const selected = files.filter((file) => !roles || file.contextRole === roles);
      return { folders: [], files: selected, truncated: false };
    });
    return prepareFixtureApi(routes, parameters.fixtureState).cleanup;
  },
} satisfies Meta<typeof Context>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Empty: Story = {
  parameters: { contextMode: "empty" },
};

export const Loading: Story = {
  parameters: { fixtureState: "loading" },
};

export const Failure: Story = {
  parameters: { fixtureState: "failure" },
};
