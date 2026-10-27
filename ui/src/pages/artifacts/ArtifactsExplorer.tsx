import { DeliverableReviewPanel } from "@/components/DeliverableReviewPanel";
import { MediaProjectPanel } from "@/components/MediaProjectPanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Film } from "lucide-react";
import { companyArtifactsArchivePath, type CompanyArtifact } from "@/api/artifacts";
import { useNavigate } from "@/lib/router";
import { companyFilesApi, type CompanyFile, type CompanyFileFolderNode } from "@/api/company-files";
import type { ResourceMemberships } from "@paperclipai/shared";
import { useCompany } from "@/context/CompanyContext";
import { useDialogActions } from "@/context/DialogContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompanyFileUploads } from "@/hooks/useCompanyFileUploads";
import { useExplorerStarMutation, useResourceMemberships } from "@/hooks/useResourceMemberships";
import { PageSkeleton } from "@/components/PageSkeleton";
import { ArtifactDropzone } from "@/components/artifacts/ArtifactDropzone";
import { artifactSelectionFromExplorer } from "@/components/artifacts/ArtifactAttachmentPicker";
import { ArtifactUploadContent } from "@/components/artifacts/ArtifactUploadControls";
import { ArtifactFullscreenDialog } from "@/components/artifacts/explorer/ArtifactFullscreenDialog";
import {
  ArtifactPreviewPane,
  type ArtifactPreviewAction,
  type PreviewFolder,
  type PreviewUsage,
} from "@/components/artifacts/explorer/ArtifactPreviewPane";
import type { PreviewTarget } from "@/components/artifacts/explorer/preview-target";
import { ExplorerContextMenu, buildContextMenuEntries } from "@/components/artifacts/explorer/ExplorerContextMenu";
import { ExplorerIcons } from "@/components/artifacts/explorer/ExplorerIcons";
import { ExplorerList } from "@/components/artifacts/explorer/ExplorerList";
import { ExplorerStatusBar } from "@/components/artifacts/explorer/ExplorerStatusBar";
import { ExplorerToolbar } from "@/components/artifacts/explorer/ExplorerToolbar";
import { ExplorerTree } from "@/components/artifacts/explorer/ExplorerTree";
import {
  entryFileItem,
  entryFolderItem,
  entryVersionEntries,
  explorerItemStarred,
  explorerStarSets,
  explorerStarTarget,
  folderArchivePath,
  isHiddenFromAgents,
  outFileItem,
  outGroupItem,
  outNodeItem,
  siblingVersions,
  sortExplorerItems,
  toPreviewTarget,
  type ExplorerItem,
} from "@/components/artifacts/explorer/explorer-model";
import { ContextFilterBar } from "@/components/artifacts/explorer/ContextFilterBar";
import { FileContextProperties } from "@/components/artifacts/explorer/FileContextProperties";
import { useContextMode } from "@/components/artifacts/explorer/useContextMode";
import { useFolderAgentVisibility } from "@/components/artifacts/explorer/useFolderAgentVisibility";
import { useInboxDialogs } from "@/components/artifacts/explorer/inbox/InboxDialogs";
import {
  useEntryList,
  useEntryTree,
  useExplorerKeyboard,
  useExplorerNavigation,
  useOutGroupArtifacts,
  useOutGroups,
  useOutIssueArtifacts,
  useOutStarredArtifacts,
  useOutTreeNode,
  type ExplorerTarget,
} from "@/components/artifacts/explorer/useExplorerNavigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTranslation } from "@/i18n";
import { queryKeys } from "@/lib/queryKeys";

const WIDE_QUERY = "(min-width: 768px)";
const NOTICE_MS = 2000;

/** Preview as a side pane from md up, as a bottom sheet below. */
function useIsWide(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function" ? true : window.matchMedia(WIDE_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return wide;
}

function downloadFile(path: string | null, name: string) {
  if (!path) return;
  const anchor = document.createElement("a");
  anchor.href = path;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

interface MenuState {
  x: number;
  y: number;
  item: ExplorerItem;
}

export function ArtifactsExplorer() {
  const { t: tr } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue } = useDialogActions();
  const companyId = selectedCompanyId ?? "";
  const { setBreadcrumbs } = useBreadcrumbs();
  const navigate = useNavigate();
  const nav = useExplorerNavigation(companyId);
  const inbox = useInboxDialogs(companyId);
  // Context view (?context=1): the Entrada narrowed to reference files; uploads from it get context properties.
  const context = useContextMode(companyId, nav.contextFilter, nav.q);
  const uploads = useCompanyFileUploads(
    companyId,
    nav.box === "in" ? nav.folderId : null,
    context.active ? context.applyUploadDefaults : undefined,
  );
  const isWide = useIsWide();

  const [versionPick, setVersionPick] = useState<{ fileId: string; versionNumber: number } | null>(null);
  const [fullscreen, setFullscreen] = useState<PreviewTarget | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setBreadcrumbs([{ label: tr("uxFiles.files", { defaultValue: "Files" }) }]);
  }, [setBreadcrumbs, tr]);

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const { mutate: setFolderVisibility, isPending: visibilityPending } = useFolderAgentVisibility(companyId, {
    onError: () => flash(tr("artifacts.explorer.visibility.error")),
  });

  const toggleAgentVisible = useCallback(
    (item: ExplorerItem) => {
      if (item.box !== "in" || item.kind !== "folder" || !item.nodeId) return;
      // Hidden folders become visible and the other way round.
      setFolderVisibility({ folderId: item.nodeId, agentVisible: isHiddenFromAgents(item) });
    },
    [setFolderVisibility],
  );

  /**
   * Downloads a ZIP archive. A HEAD request first, so 422 (empty) and 413 (over 500 MB)
   * show a status notice instead of a broken download; otherwise a hidden anchor saves it.
   */
  const downloadArchive = useCallback(
    async (path: string, name: string) => {
      try {
        const response = await fetch(path, { method: "HEAD", credentials: "same-origin" });
        if (response.status === 422) {
          flash(tr("artifacts.explorer.zip.empty"));
          return;
        }
        if (response.status === 413) {
          flash(tr("artifacts.explorer.zip.tooLarge"));
          return;
        }
        if (!response.ok) {
          flash(tr("artifacts.explorer.zip.failed"));
          return;
        }
        const anchor = document.createElement("a");
        anchor.href = path;
        anchor.download = `${name}.zip`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch {
        flash(tr("artifacts.explorer.zip.failed"));
      }
    },
    [flash, tr],
  );

  /* ----- data ----- */
  const quick = nav.quick;
  const isIn = nav.box === "in";
  const isOutFavorites = !isIn && nav.node === "favorites";
  const isIssueNode = !isIn && nav.node.startsWith("issue:");
  const issueId = isIssueNode ? nav.node.slice("issue:".length) : null;
  const groupMode = !isIn && nav.groupBy !== null && !isOutFavorites;

  const entryTree = useEntryTree(companyId);
  const entryList = useEntryList(companyId, isIn && !quick ? nav.folderId : null, isIn ? quick : null, nav.q, isIn && !context.active);
  const outTree = useOutTreeNode(companyId, nav.node, !isIn && !isIssueNode && !groupMode && !isOutFavorites);
  const outStarred = useOutStarredArtifacts(companyId, isOutFavorites);
  const issueList = useOutIssueArtifacts(companyId, isIn ? null : issueId);
  const groups = useOutGroups(companyId, groupMode && nav.node === "root" && !nav.groupKey ? nav.groupBy : null);
  const groupArtifacts = useOutGroupArtifacts(
    companyId,
    groupMode && nav.groupKey ? nav.groupBy : null,
    nav.groupKey,
  );

  const activeQuery = context.active
    ? context.files
    : isIn
    ? entryList
    : isOutFavorites
      ? outStarred
      : groupMode && nav.groupKey
        ? groupArtifacts
        : groupMode && nav.node === "root"
          ? groups
          : isIssueNode
            ? issueList
            : outTree;
  const loading = activeQuery.isLoading;
  const failed = activeQuery.isError;

  const rawItems = useMemo<ExplorerItem[]>(() => {
    if (context.active) return context.visibleFiles.map(entryFileItem);
    if (isIn) {
      const folders = quick ? [] : ((entryList.data?.folders ?? []) as CompanyFileFolderNode[]);
      return [...folders.map(entryFolderItem), ...(entryList.data?.files ?? []).map(entryFileItem)];
    }
    if (isOutFavorites) return (outStarred.data?.artifacts ?? []).map(outFileItem);
    if (groupMode && nav.groupKey) return (groupArtifacts.data?.artifacts ?? []).map(outFileItem);
    if (groupMode && nav.node === "root") return (groups.data ?? []).map(outGroupItem);
    if (isIssueNode) return (issueList.data?.artifacts ?? []).map(outFileItem);
    return (outTree.data?.children ?? []).map(outNodeItem);
  }, [
    context.active,
    context.visibleFiles,
    isIn,
    quick,
    entryList.data,
    isOutFavorites,
    outStarred.data,
    groupMode,
    nav.groupKey,
    nav.node,
    groupArtifacts.data,
    groups.data,
    isIssueNode,
    issueList.data,
    outTree.data,
  ]);

  const memberships = useResourceMemberships(companyId);
  const starSets = useMemo(
    () => explorerStarSets(memberships.data as ResourceMemberships | undefined),
    [memberships.data],
  );

  const items = useMemo(() => {
    const starred = rawItems.map((item) => ({ ...item, starred: explorerItemStarred(item, starSets) }));
    const needle = nav.q.toLowerCase();
    const filtered = needle ? starred.filter((item) => item.name.toLowerCase().includes(needle)) : starred;
    return sortExplorerItems(filtered, nav.sort, nav.dir);
  }, [rawItems, starSets, nav.q, nav.sort, nav.dir]);

  const selected = items.find((item) => item.id === nav.sel) ?? null;
  const selectedArtifact = selected?.box === "out" && selected.kind === "file" ? selected.raw as CompanyArtifact : null;
  const selectedFile = selected?.box === "in" && selected.kind === "file" ? (selected.raw as CompanyFile) : null;

  const versionsQuery = useQuery({
    queryKey: queryKeys.companyFiles.versions(selectedFile?.id ?? "none"),
    queryFn: () => companyFilesApi.versions(selectedFile!.id),
    enabled: selectedFile !== null && selectedFile.versionCount > 1,
  });
  const usageQuery = useQuery({
    queryKey: queryKeys.companyFiles.usage(selectedFile?.id ?? "none"),
    queryFn: () => companyFilesApi.usage(selectedFile!.id),
    enabled: selectedFile !== null,
  });
  const pinnedVersion = selectedFile && versionPick?.fileId === selectedFile.id ? versionPick.versionNumber : null;

  const previewUsage = useMemo<PreviewUsage | null>(() => {
    if (!selectedFile) return null;
    return {
      status: usageQuery.isError ? "error" : usageQuery.data ? "ready" : "loading",
      tasks: (usageQuery.data ?? []).map((usage) => {
        const label = usage.issueIdentifier ?? usage.issueTitle;
        return { id: usage.issueId, label, href: `/issues/${usage.issueIdentifier ?? usage.issueId}` };
      }),
    };
  }, [selectedFile, usageQuery.data, usageQuery.isError]);

  const folderPath = nav.crumbs.map((crumb) => crumb.label).join(" › ");

  const previewTarget = useMemo(() => {
    if (!selected || selected.kind !== "file") return null;
    const versions =
      selected.box === "in"
        ? selectedFile && versionsQuery.data && versionsQuery.data.length > 1
          ? entryVersionEntries(versionsQuery.data, selectedFile.currentVersionNumber ?? 1, (versionNumber) =>
              setVersionPick({ fileId: selectedFile.id, versionNumber }),
            )
          : undefined
        : siblingVersions(selected, items, (id) => nav.selectItem(id));
    return toPreviewTarget(selected, { folderPath, versions, versionNumber: pinnedVersion, quickView: quick !== null });
  }, [selected, selectedFile, versionsQuery.data, items, nav, folderPath, pinnedVersion, quick]);

  /* ----- actions ----- */
  const openFullscreen = useCallback((target: PreviewTarget | null) => {
    if (target) setFullscreen(target);
  }, []);

  const copyLink = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard
      .writeText(url)
      .then(() => flash(tr("artifacts.explorer.status.copied")))
      .catch(() => flash(tr("artifacts.explorer.status.copyFailed")));
  }, [flash, tr]);

  const { mutate: starMutate } = useExplorerStarMutation(companyId);
  const toggleFavorite = useCallback(
    (item: ExplorerItem) => {
      const target = explorerStarTarget(item);
      if (!target) return;
      starMutate({ target, starred: !item.starred });
    },
    [starMutate],
  );

  const navigateInto = useCallback(
    (item: ExplorerItem) => {
      if (item.box === "in") {
        nav.go({ box: "in", folderId: item.nodeId });
        return;
      }
      if (item.groupKey) {
        nav.go({ box: "out", node: "root", groupBy: nav.groupBy, groupKey: item.groupKey });
        return;
      }
      if (item.nodeId) nav.go({ box: "out", node: item.nodeId });
    },
    [nav],
  );

  const openItem = useCallback(
    (item: ExplorerItem) => {
      if (item.kind === "folder") {
        navigateInto(item);
        return;
      }
      nav.selectItem(item.id);
      openFullscreen(toPreviewTarget(item, { folderPath, versionNumber: null, quickView: quick !== null }));
    },
    [folderPath, nav, navigateInto, openFullscreen, quick],
  );

  const showProperties = useCallback(
    (item: ExplorerItem) => {
      nav.selectItem(item.id);
      nav.setPreviewOpen(true);
    },
    [nav],
  );

  const menuActions = useMemo(
    () => ({
      open: openItem,
      preview: showProperties,
      properties: showProperties,
      download: (item: ExplorerItem) => downloadFile(item.downloadPath, item.name),
      downloadZip: (item: ExplorerItem) => {
        const path = folderArchivePath(item, companyId);
        if (path) void downloadArchive(path, item.name);
      },
      toggleAgentVisible,
      copyLink: (item: ExplorerItem) => {
        nav.selectItem(item.id);
        copyLink();
      },
      toggleFavorite,
      createTask: (item: ExplorerItem) => {
        if (item.kind !== "file") return;
        const raw = item.raw as CompanyFile | CompanyArtifact;
        let projectId: string | undefined;
        let versionId: string | null | undefined;
        if (item.box === "in") {
          const file = raw as CompanyFile;
          projectId = file.audienceKind === "project" ? file.audienceId ?? undefined : undefined;
          versionId = versionPick?.fileId === file.id
            ? versionsQuery.data?.find((version) => version.versionNumber === versionPick.versionNumber)?.id
            : file.currentVersionId;
        } else {
          projectId = (raw as CompanyArtifact).project?.id;
        }
        openNewIssue({
          title: item.name,
          ...(projectId ? { projectId } : {}),
          attachments: [artifactSelectionFromExplorer(item, versionId)],
          navigateOnCreate: true,
        });
      },
      goTask: (item: ExplorerItem) => {
        const href = (item.raw as CompanyArtifact).href;
        if (href) navigate(href);
      },
      moveToInbox: (item: ExplorerItem) => {
        const artifact = item.raw as CompanyArtifact;
        const separator = artifact.id.indexOf(":");
        const source = artifact.id.slice(0, separator);
        if (separator < 0 || !["attachment", "work_product", "document"].includes(source)) {
          flash(tr("artifacts.explorer.errors.moveToInbox"));
          return;
        }
        inbox.openMoveToInbox({
          source: source as "attachment" | "work_product" | "document",
          id: artifact.id.slice(separator + 1),
          name: artifact.title,
        });
      },
      replaceVersion: (item: ExplorerItem) => inbox.openReplaceVersion(item.raw as CompanyFile),
      move: (item: ExplorerItem) => inbox.openMoveFile(item.raw as CompanyFile),
      rename: (item: ExplorerItem) => {
        if (item.kind === "folder") inbox.openRenameFolder({ id: item.nodeId ?? "", name: item.name });
        else inbox.openRenameFile(item.raw as CompanyFile);
      },
      remove: (item: ExplorerItem) => {
        if (item.kind === "folder") inbox.openDeleteFolder({ id: item.nodeId ?? "", name: item.name });
        else inbox.openDeleteFile(item.raw as CompanyFile);
      },
    }),
    [companyId, copyLink, downloadArchive, flash, inbox, nav, navigate, openItem, openNewIssue, showProperties, toggleAgentVisible, toggleFavorite, tr, versionPick, versionsQuery.data],
  );

  const handleKey = useExplorerKeyboard({
    items,
    selectedId: nav.sel,
    onSelect: (id) => nav.selectItem(id),
    onOpen: openItem,
    onUp: () => {
      if (nav.canUp) nav.up();
    },
    onPreview: () => nav.setPreviewOpen(true),
    onAction: (action, item) => {
      if (action === "download") downloadFile(item.downloadPath, item.name);
      if (action === "rename") menuActions.rename(item);
      if (action === "delete") menuActions.remove(item);
    },
  });

  const previewActions: ArtifactPreviewAction[] = useMemo(() => {
    if (!selected || selected.kind !== "file") return [];
    const open: ArtifactPreviewAction = {
      id: "open",
      label: tr("artifacts.explorer.ctx.open"),
      onSelect: () => openFullscreen(previewTarget),
    };
    const download: ArtifactPreviewAction = {
      id: "download",
      label: tr("artifacts.explorer.ctx.download"),
      onSelect: () => downloadFile(selected.downloadPath, selected.name),
    };
    const createTask: ArtifactPreviewAction = {
      id: "create-task",
      label: tr("artifacts.explorer.ctx.createTask"),
      onSelect: () => menuActions.createTask(selected),
    };
    const copy: ArtifactPreviewAction = { id: "copy", label: tr("artifacts.explorer.ctx.copyLink"), onSelect: copyLink };
    const favorite: ArtifactPreviewAction = {
      id: "favorite",
      label: selected.starred
        ? `★ ${tr("artifacts.explorer.ctx.unfavorite")}`
        : `☆ ${tr("artifacts.explorer.ctx.favorite")}`,
      onSelect: () => toggleFavorite(selected),
    };
    if (selected.box === "in") {
      const createVideo: ArtifactPreviewAction[] = selectedFile
        && selectedFile.audienceKind === "company"
        && !selectedFile.validUntil
        && selectedFile.contentType.startsWith("video/")
        ? [{
            id: "create-video",
            label: tr("uxFiles.createVideoFromFile", { defaultValue: "Create video from this file" }),
            icon: Film,
            onSelect: () => navigate(`/artifacts/media/new?sourceFileId=${encodeURIComponent(selectedFile.id)}`),
          }]
        : [];
      return [
        open,
        createTask,
        download,
        ...createVideo,
        { id: "replace", label: tr("artifacts.explorer.ctx.replace"), onSelect: () => menuActions.replaceVersion(selected) },
        { id: "move", label: tr("artifacts.explorer.ctx.move"), onSelect: () => menuActions.move(selected) },
        { id: "rename", label: tr("artifacts.explorer.ctx.rename"), onSelect: () => menuActions.rename(selected) },
        copy,
        favorite,
        { id: "remove", label: tr("artifacts.explorer.ctx.remove"), destructive: true, onSelect: () => menuActions.remove(selected) },
      ];
    }
    return [
      open,
      createTask,
      download,
      { id: "task", label: tr("artifacts.explorer.ctx.goTask"), onSelect: () => menuActions.goTask(selected) },
      { id: "inbox", label: tr("artifacts.explorer.ctx.moveToInbox"), onSelect: () => menuActions.moveToInbox(selected) },
      copy,
      favorite,
    ];
  }, [copyLink, menuActions, navigate, openFullscreen, previewTarget, selected, selectedFile, toggleFavorite, tr]);

  const uploadBlocker = context.active ? context.uploadBlocker : null;
  const handleUpload = useCallback(
    (files: File[]) => {
      if (uploadBlocker) {
        flash(tr("context.uploadBlocked", { defaultValue: "Elige un proyecto autorizado en las propiedades de subida antes de subir archivos." }));
        return;
      }
      uploads.upload(files);
    },
    [flash, tr, uploadBlocker, uploads],
  );

  // The upload list only shows work in progress or failures; finished rows are cleared by the hook.
  const visibleUploads = useMemo(
    () =>
      uploads.entries
        .filter((entry) => entry.status !== "done")
        .map((entry) => ({
          id: entry.id,
          filename: entry.filename,
          status: entry.status === "error" ? ("error" as const) : ("uploading" as const),
          error: entry.error,
        })),
    [uploads.entries],
  );

  const menuEntries = menu
    ? buildContextMenuEntries(nav.box, menu.item, menuActions, (key: string) => tr(key), {
        archivable: folderArchivePath(menu.item, companyId) !== null,
        agentVisible: !isHiddenFromAgents(menu.item),
      })
    : [];

  // Salida project or issue node with nothing selected: the toolbar downloads the whole node.
  const archiveNode = !isIn && (nav.node.startsWith("issue:") || nav.node.startsWith("project:")) ? nav.node : null;
  const archivePath = archiveNode ? companyArtifactsArchivePath(companyId, archiveNode) : null;
  const archiveName = nav.crumbs[nav.crumbs.length - 1]?.label ?? "salida";
  const selectedFolder = selected && selected.kind === "folder" && selected.box === "in" && selected.nodeId ? selected : null;
  const folderPanel: PreviewFolder | null = selectedFolder
    ? {
        name: selectedFolder.name,
        agentVisible: !isHiddenFromAgents(selectedFolder),
        pending: visibilityPending,
        onToggleAgentVisible: () => toggleAgentVisible(selectedFolder),
      }
    : null;

  const closeMenu = useCallback(() => setMenu(null), []);

  const emptyTitle = nav.q
    ? tr("artifacts.explorer.empty.noMatch", { q: nav.q })
    : context.active
      ? tr("context.empty", { defaultValue: "Todavía no hay archivos en esta sección." })
      : tr("artifacts.explorer.empty.folder");
  const emptyHint = nav.q || context.active
    ? null
    : isIn
      ? tr("artifacts.explorer.empty.folderHint")
      : tr("artifacts.explorer.empty.outHint");

  const isWideLayout = isWide;
  const previewVisible = nav.previewOpen && selected !== null;
  const sheetOpen = !isWideLayout && previewVisible;

  const content = loading ? (
    <PageSkeleton variant="list" />
  ) : failed ? (
    <p role="alert" className="p-6 text-sm text-destructive">
      {tr("artifacts.explorer.errors.load")}
    </p>
  ) : items.length === 0 ? (
    <div className="flex flex-col items-center gap-1 px-6 py-16 text-center text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{emptyTitle}</p>
      {emptyHint ? <p>{emptyHint}</p> : null}
    </div>
  ) : nav.view === "list" ? (
    <ExplorerList
      box={nav.box}
      items={items}
      sort={nav.sort}
      dir={nav.dir}
      onSort={nav.toggleSort}
      folderColumn={quick !== null}
      selectedId={nav.sel}
      onSelect={(item) => nav.selectItem(item.id)}
      onOpen={openItem}
      onContextMenu={(item, x, y) => setMenu({ x, y, item })}
    />
  ) : (
    <ExplorerIcons
      items={items}
      selectedId={nav.sel}
      onSelect={(item) => nav.selectItem(item.id)}
      onOpen={openItem}
      onContextMenu={(item, x, y) => setMenu({ x, y, item })}
    />
  );

  const previewEmptyHint = selected && selected.kind === "folder" ? tr("artifacts.explorer.preview.folderHint") : undefined;
  const previewPane = (
    <ArtifactPreviewPane
      target={previewTarget}
      onClose={() => (isWideLayout ? nav.setPreviewOpen(false) : nav.selectItem(null))}
      onOpenFullscreen={(target) => openFullscreen(target)}
      actions={previewActions}
      emptyHint={previewEmptyHint}
      usage={selectedFile ? previewUsage : null}
      folder={folderPanel}
      supplement={<>
        {selectedArtifact ? <DeliverableReviewPanel issueId={selectedArtifact.issue.id} targetId={selectedArtifact.reviewTargetId ?? selectedArtifact.id.replace(/^work_product:/, "")} /> : selectedFile?.currentVersionId ? <DeliverableReviewPanel companyId={companyId} targetId={selectedFile.currentVersionId} /> : null}
        {selectedFile ? <FileContextProperties key={`${selectedFile.id}:${String(selectedFile.updatedAt)}`} companyId={companyId} file={selectedFile} /> : null}
        {(selectedArtifact?.mediaProjectId || selectedArtifact?.assetId && selectedArtifact.contentType?.startsWith("video/") || selectedFile?.contentType.startsWith("video/")) ? <MediaProjectPanel key={selectedArtifact?.id ?? selectedFile?.id} companyId={companyId} assetId={selectedArtifact?.assetId ?? undefined} projectId={selectedArtifact?.mediaProjectId ?? undefined} companyFileId={selectedFile?.id} /> : null}
      </>}
    />
  );

  if (!companyId) return <PageSkeleton variant="list" />;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <ExplorerToolbar
        box={nav.box}
        onBox={(box) => nav.go(box === "in" ? { box: "in" } : { box: "out", node: "root" })}
        canBack={nav.canBack}
        canForward={nav.canForward}
        onBack={nav.back}
        onForward={nav.forward}
        crumbs={nav.crumbs}
        onCrumb={(target: ExplorerTarget) => nav.go(target)}
        query={nav.q}
        onQuery={nav.setQuery}
        scopeName={nav.crumbs[nav.crumbs.length - 1]?.label ?? ""}
        view={nav.view}
        onView={nav.setView}
        previewOpen={nav.previewOpen}
        onTogglePreview={() => nav.setPreviewOpen(!nav.previewOpen)}
        onUpload={handleUpload}
        onNewFolder={() => inbox.openNewFolder(nav.folderId)}
        contextActive={context.active}
        onToggleContext={() => nav.setContextFilter(nav.contextFilter ? null : { role: "any", validity: "all", audience: "any", projectId: null })}
        downloadEnabled={selected ? selected.kind === "file" : archivePath !== null}
        onDownload={() => {
          if (selected) {
            if (selected.kind === "file") downloadFile(selected.downloadPath, selected.name);
            return;
          }
          if (archivePath) void downloadArchive(archivePath, archiveName);
        }}
      />

      {nav.contextFilter ? (
        <ContextFilterBar
          filter={nav.contextFilter}
          onFilter={nav.setContextFilter}
          onClose={() => nav.setContextFilter(null)}
          mode={context}
        />
      ) : null}

      <div className="flex min-h-0 flex-1">
        <div className="hidden lg:flex">
          <ExplorerTree
            companyId={companyId}
            box={nav.box}
            folderId={nav.folderId}
            node={nav.node}
            groupBy={nav.groupBy}
            quick={nav.quick}
            trailIds={nav.trailIds}
            onGo={(target) => nav.go(target)}
          />
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ArtifactDropzone enabled={isIn && quick === null} onUpload={handleUpload}>
            <div className="flex h-full min-h-0 flex-col">
              {visibleUploads.length > 0 ? (
                <div className="border-b border-border p-3">
                  <ArtifactUploadContent entries={visibleUploads} onRetry={uploads.retry} onDismiss={uploads.dismiss} />
                </div>
              ) : null}
              <div
                role="region"
                aria-label={tr("artifacts.explorer.list.label")}
                tabIndex={0}
                onKeyDown={handleKey}
                onClick={(event) => {
                  if (event.target === event.currentTarget) nav.selectItem(null);
                }}
                className="min-h-0 flex-1 overflow-auto focus:outline-none"
              >
                {content}
              </div>
              <ExplorerStatusBar box={nav.box} count={items.length} selected={selected} notice={notice} />
            </div>
          </ArtifactDropzone>
        </div>

        {isWideLayout && previewVisible ? previewPane : null}
      </div>

      <Sheet open={sheetOpen} onOpenChange={(open) => { if (!open) nav.selectItem(null); }}>
        <SheetContent side="bottom" className="flex h-4/5 flex-col gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>{tr("artifacts.explorer.preview.title")}</SheetTitle>
            <SheetDescription>{tr("artifacts.explorer.preview.fullscreenTitle")}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 overflow-y-auto">{previewPane}</div>
        </SheetContent>
      </Sheet>

      {menu ? (
        <ExplorerContextMenu x={menu.x} y={menu.y} entries={menuEntries} onClose={closeMenu} />
      ) : null}

      {inbox.dialogs}
      <ArtifactFullscreenDialog target={fullscreen} onClose={() => setFullscreen(null)} />
    </div>
  );
}
