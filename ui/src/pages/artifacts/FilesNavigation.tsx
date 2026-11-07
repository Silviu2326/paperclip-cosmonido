import { PageTabBar, type PageTabItem } from "@/components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { Outlet, useActiveCompanyPrefix, useLocation, useNavigate } from "@/lib/router";
import { Film } from "lucide-react";

type FilesTab = PageTabItem & { to: string; matches: (pathname: string) => boolean };

/** Params of the Entrada context view; the Files tab drops them, the Context tab sets `context=1`. */
const CONTEXT_PARAMS = ["context", "role", "validity", "audience", "projectId"];

const onOrUnder = (path: string) => (pathname: string) => pathname === path || pathname.startsWith(`${path}/`);

export function FilesNavigation() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const companyPrefix = useActiveCompanyPrefix();
  const pathname = companyPrefix && location.pathname.startsWith(`/${companyPrefix}/`)
    ? location.pathname.slice(companyPrefix.length + 1)
    : location.pathname;
  const contextView = new URLSearchParams(location.search).get("context") === "1";
  const tabs: FilesTab[] = [
    {
      value: "files",
      to: "/artifacts",
      label: t("uxFiles.files", { defaultValue: "Files" }),
      matches: (path) => onOrUnder("/artifacts")(path)
        && !(contextView && path === "/artifacts")
        && !onOrUnder("/artifacts/media/queue")(path),
    },
    {
      value: "context",
      to: "/artifacts",
      label: t("uxFiles.context", { defaultValue: "Context" }),
      matches: (path) => contextView && path === "/artifacts",
    },
    {
      value: "production",
      to: "/artifacts/media/queue",
      label: t("uxFiles.production", { defaultValue: "Production" }),
      matches: onOrUnder("/artifacts/media/queue"),
    },
  ];
  const active = tabs.find((tab) => tab.matches(pathname)) ?? tabs[0]!;
  const isCreatingVideo = onOrUnder("/artifacts/media/new")(pathname);
  const selectTab = (value: string) => {
    const target = tabs.find((tab) => tab.value === value);
    if (!target) return;
    const params = new URLSearchParams(location.search);
    for (const key of CONTEXT_PARAMS) params.delete(key);
    if (value === "context") params.set("context", "1");
    const search = params.toString();
    navigate(`${target.to}${search ? `?${search}` : ""}${location.hash}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={active.value} onValueChange={selectTab}>
          <PageTabBar items={tabs} value={active.value} onValueChange={selectTab} align="start" />
        </Tabs>
        {!isCreatingVideo && (
          <Button size="sm" onClick={() => navigate(`/artifacts/media/new${location.search}${location.hash}`)}>
            <Film data-icon="inline-start" />
            {t("uxFiles.createVideo", { defaultValue: "Create video" })}
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  );
}
