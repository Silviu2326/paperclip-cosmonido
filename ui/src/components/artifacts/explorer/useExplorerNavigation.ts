import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { artifactsApi, type CompanyArtifactGroup, type CompanyArtifactTreeNode } from "@/api/artifacts";
import { companyFilesApi, type CompanyFileFolderNode, type ListCompanyFilesParams } from "@/api/company-files";
import { t } from "@/i18n";
import { useLocation, useNavigate, useSearchParams } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";
import { contextFilterParams, parseContextFilter, type ContextFilter } from "./context-properties";
import {
  EXPLORER_SORT_KEYS,
  type ExplorerBox,
  type ExplorerItem,
  type ExplorerSortDir,
  type ExplorerSortKey,
  type ExplorerView,
} from "./explorer-model";

const VIEW_STORAGE_KEY = "paperclip.artifactsExplorer.view";
const PREVIEW_STORAGE_KEY = "paperclip.artifactsExplorer.preview";

/* ---------- URL <-> state ---------- */

function decodeSegment(segment: string | undefined): string | null {
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/**
 * Quick-access views. Their path segments are reserved: they never collide with
 * folder UUIDs or Salida node ids. `favorites` exists in both boxes; `recent` and
 * `mine` are Entrada-only.
 */
export const EXPLORER_QUICK_VIEWS = ["favorites", "recent", "mine"] as const;
export type ExplorerQuick = (typeof EXPLORER_QUICK_VIEWS)[number];

function isQuick(value: string | null): value is ExplorerQuick {
  return value !== null && (EXPLORER_QUICK_VIEWS as readonly string[]).includes(value);
}

export interface ExplorerRoute {
  box: ExplorerBox;
  folderId: string | null;
  /** Salida tree node id (`root`, `projects`, `no_project`, `project:<id>`, `issue:<id>`, `favorites`). */
  node: string;
  quick: ExplorerQuick | null;
}

/** `/…/artifacts`, `/…/artifacts/in/:folderId|:quick?`, `/…/artifacts/out/:node?` */
export function parseExplorerPath(pathname: string): ExplorerRoute {
  const segments = pathname.split("/").filter(Boolean);
  const index = segments.indexOf("artifacts");
  const rest = index >= 0 ? segments.slice(index + 1) : [];
  if (rest[0] === "out") {
    const node = decodeSegment(rest[1]) ?? "root";
    return { box: "out", folderId: null, node, quick: node === "favorites" ? "favorites" : null };
  }
  if (rest[0] === "in") {
    const segment = decodeSegment(rest[1]);
    if (isQuick(segment)) return { box: "in", folderId: null, node: "root", quick: segment };
    return { box: "in", folderId: segment, node: "root", quick: null };
  }
  return { box: "in", folderId: null, node: "root", quick: null };
}

export type ExplorerTarget =
  | {
      box: "in";
      folderId?: string | null;
      quick?: ExplorerQuick | null;
      sort?: ExplorerSortKey;
      dir?: ExplorerSortDir;
    }
  | {
      box: "out";
      node?: string;
      groupBy?: string | null;
      groupKey?: string | null;
      sort?: ExplorerSortKey;
      dir?: ExplorerSortDir;
    };

export function explorerTargetPath(target: ExplorerTarget): string {
  if (target.box === "in") {
    if (target.quick) return `/artifacts/in/${target.quick}`;
    return target.folderId ? `/artifacts/in/${encodeURIComponent(target.folderId)}` : "/artifacts";
  }
  return `/artifacts/out/${encodeURIComponent(target.node ?? "root")}`;
}

/** Tree and crumb target for a quick view. Recent is date-descending by definition. */
export function quickViewTarget(quick: ExplorerQuick): ExplorerTarget {
  if (quick === "recent") return { box: "in", quick, sort: "date", dir: "desc" };
  return { box: "in", quick };
}

function parseSort(value: string | null): ExplorerSortKey {
  return EXPLORER_SORT_KEYS.find((key) => key === value) ?? "name";
}

function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked (private windows); the URL still carries the state.
  }
}

/* ---------- data hooks (shared by tree, list and crumbs) ---------- */

export function useEntryTree(companyId: string) {
  return useQuery({
    queryKey: queryKeys.companyFiles.tree(companyId),
    queryFn: () => companyFilesApi.tree(companyId),
    enabled: companyId.length > 0,
  });
}

/** Entrada listing: one folder, or a quick-access view across the whole Entrada. */
export function useEntryList(
  companyId: string,
  folderId: string | null,
  quick: ExplorerQuick | null,
  q: string,
  enabled = true,
) {
  const quickParams: ListCompanyFilesParams | null = quick
    ? {
        scope: "all",
        q: q || undefined,
        ...(quick === "favorites" ? { starred: true } : {}),
        ...(quick === "recent" ? { sort: "date", dir: "desc" } : {}),
        ...(quick === "mine" ? { createdByMe: true } : {}),
      }
    : null;
  return useQuery({
    queryKey: quick
      ? queryKeys.companyFiles.list(
          companyId,
          null,
          q,
          quick === "recent" ? "date" : null,
          quick === "recent" ? "desc" : null,
          quick,
        )
      : queryKeys.companyFiles.list(companyId, folderId, q, null, null),
    queryFn: () =>
      quickParams
        ? companyFilesApi.list(companyId, quickParams)
        : companyFilesApi.list(companyId, { folderId: folderId ?? undefined, q: q || undefined }),
    enabled: enabled && companyId.length > 0,
  });
}

/** Salida favorites: starred documents, attachments and work products, flat. */
export function useOutStarredArtifacts(companyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["artifacts", companyId, "explorer-starred"] as const,
    queryFn: () => artifactsApi.list(companyId, { starred: true, limit: 200 }),
    enabled: enabled && companyId.length > 0,
  });
}

export function useOutTreeNode(companyId: string, node: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.artifacts.tree(companyId, node),
    queryFn: () => artifactsApi.tree(companyId, node),
    enabled: enabled && companyId.length > 0,
  });
}

export function useOutGroups(companyId: string, groupBy: string | null, enabled = true) {
  return useQuery({
    queryKey: ["artifacts", companyId, "explorer-groups", groupBy] as const,
    queryFn: async () => (await artifactsApi.list(companyId, { groupBy: groupBy as never })).groups ?? [],
    enabled: enabled && companyId.length > 0 && groupBy !== null,
  });
}

export function useOutGroupArtifacts(companyId: string, groupBy: string | null, groupKey: string | null) {
  return useQuery({
    queryKey: ["artifacts", companyId, "explorer-group", groupBy, groupKey] as const,
    queryFn: () => artifactsApi.list(companyId, { groupBy: groupBy as never, groupKey: groupKey ?? undefined, limit: 200 }),
    enabled: companyId.length > 0 && groupBy !== null && groupKey !== null,
  });
}

export function useOutIssueArtifacts(companyId: string, issueId: string | null) {
  return useQuery({
    queryKey: ["artifacts", companyId, "explorer-issue", issueId] as const,
    queryFn: () => artifactsApi.list(companyId, { issueId: issueId ?? undefined, limit: 200 }),
    enabled: companyId.length > 0 && issueId !== null,
  });
}

/* ---------- breadcrumbs ---------- */

export interface ExplorerCrumb {
  id: string;
  label: string;
  target: ExplorerTarget;
}

/** Folder ancestors (root first) of `folderId` inside the Entrada tree. */
export function folderTrail(nodes: CompanyFileFolderNode[], folderId: string): CompanyFileFolderNode[] {
  for (const node of nodes) {
    if (node.id === folderId) return [node];
    const inner = folderTrail(node.children ?? [], folderId);
    if (inner.length > 0) return [node, ...inner];
  }
  return [];
}

const GROUP_LABEL_KEYS: Record<string, string> = {
  agent: "artifacts.explorer.crumbs.byAgent",
  media_kind: "artifacts.explorer.crumbs.byType",
  day: "artifacts.explorer.crumbs.byDate",
};

/** Shared breadcrumb trail. Labels come from the tree and artifact data already loaded for the page. */
const QUICK_LABEL_KEYS: Record<ExplorerQuick, string> = {
  favorites: "artifacts.explorer.tree.favorites",
  recent: "artifacts.explorer.tree.recent",
  mine: "artifacts.explorer.tree.mine",
};

export function useExplorerCrumbs(args: {
  companyId: string;
  box: ExplorerBox;
  folderId: string | null;
  node: string;
  quick: ExplorerQuick | null;
  groupBy: string | null;
  groupKey: string | null;
  entryTree: CompanyFileFolderNode[] | undefined;
}): ExplorerCrumb[] {
  const { companyId, box, folderId, node, quick, groupBy, groupKey, entryTree } = args;
  const isIssue = box === "out" && node.startsWith("issue:");
  const issueId = isIssue ? node.slice("issue:".length) : null;
  const projectsTree = useOutTreeNode(companyId, "projects", box === "out" && node.startsWith("project:"));
  const issueArtifacts = useOutIssueArtifacts(companyId, issueId);
  const groups = useOutGroups(companyId, groupBy, box === "out" && groupBy !== null && groupKey !== null);

  return useMemo(() => {
    if (box === "in" && quick) {
      return [
        { id: "root", label: t("artifacts.explorer.box.in"), target: { box: "in", folderId: null } },
        { id: quick, label: t(QUICK_LABEL_KEYS[quick]), target: quickViewTarget(quick) },
      ];
    }
    if (box === "in") {
      const trail = folderId && entryTree ? folderTrail(entryTree, folderId) : [];
      return [
        { id: "root", label: t("artifacts.explorer.box.in"), target: { box: "in", folderId: null } },
        ...trail.map((folder) => ({
          id: folder.id,
          label: folder.name,
          target: { box: "in" as const, folderId: folder.id },
        })),
      ];
    }
    const crumbs: ExplorerCrumb[] = [
      { id: "root", label: t("artifacts.explorer.box.out"), target: { box: "out", node: "root" } },
    ];
    if (quick === "favorites") {
      crumbs.push({ id: "favorites", label: t(QUICK_LABEL_KEYS.favorites), target: { box: "out", node: "favorites" } });
      return crumbs;
    }
    if (node === "root" && groupBy) {
      crumbs.push({
        id: `groupBy:${groupBy}`,
        label: t(GROUP_LABEL_KEYS[groupBy] ?? "artifacts.explorer.crumbs.projects"),
        target: { box: "out", node: "root", groupBy },
      });
      if (groupKey) {
        const group = (groups.data as CompanyArtifactGroup[] | undefined)?.find((candidate) => candidate.key === groupKey);
        crumbs.push({
          id: `group:${groupKey}`,
          label: group?.label ?? groupKey,
          target: { box: "out", node: "root", groupBy, groupKey },
        });
      }
      return crumbs;
    }
    if (node === "projects" || node === "no_project") {
      crumbs.push({
        id: node,
        label: t(node === "projects" ? "artifacts.explorer.crumbs.projects" : "artifacts.explorer.crumbs.noProject"),
        target: { box: "out", node },
      });
    } else if (node.startsWith("project:")) {
      const projectNode = (projectsTree.data?.children ?? []).find((child: CompanyArtifactTreeNode) => child.id === node);
      crumbs.push({
        id: "projects",
        label: t("artifacts.explorer.crumbs.projects"),
        target: { box: "out", node: "projects" },
      });
      crumbs.push({
        id: node,
        label: projectNode?.label ?? t("artifacts.explorer.crumbs.project"),
        target: { box: "out", node },
      });
    } else if (isIssue) {
      const first = issueArtifacts.data?.artifacts[0];
      if (first?.project) {
        crumbs.push({ id: "projects", label: t("artifacts.explorer.crumbs.projects"), target: { box: "out", node: "projects" } });
        crumbs.push({
          id: `project:${first.project.id}`,
          label: first.project.name,
          target: { box: "out", node: `project:${first.project.id}` },
        });
      } else {
        crumbs.push({
          id: "no_project",
          label: t("artifacts.explorer.crumbs.noProject"),
          target: { box: "out", node: "no_project" },
        });
      }
      const identifier = first?.issue.identifier;
      const title = first?.issue.title;
      crumbs.push({
        id: node,
        label: identifier && title ? `${identifier} · ${title}` : t("artifacts.explorer.crumbs.task"),
        target: { box: "out", node },
      });
    }
    return crumbs;
  }, [box, folderId, quick, entryTree, node, groupBy, groupKey, groups.data, projectsTree.data, issueArtifacts.data, isIssue]);
}

/* ---------- navigation state ---------- */

export function useExplorerNavigation(companyId: string) {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const route = useMemo(() => parseExplorerPath(location.pathname), [location.pathname]);
  const sel = params.get("sel");
  const q = params.get("q") ?? "";
  const groupBy = params.get("groupBy");
  const groupKey = params.get("groupKey");
  const sort = parseSort(params.get("sort"));
  const dir: ExplorerSortDir = params.get("dir") === "desc" ? "desc" : "asc";
  // Context view (Entrada only): `?context=1` plus role/validity/audience/projectId.
  const contextFilter = route.box === "in" && route.folderId === null && route.quick === null ? parseContextFilter(params) : null;

  const viewParam = params.get("view");
  const view: ExplorerView =
    viewParam === "icons" || viewParam === "list" ? viewParam : readStored(VIEW_STORAGE_KEY) === "icons" ? "icons" : "list";
  const pvParam = params.get("pv");
  const previewOpen = pvParam === "0" ? false : pvParam === "1" ? true : readStored(PREVIEW_STORAGE_KEY) !== "0";

  const entryTree = useEntryTree(companyId);
  const crumbs = useExplorerCrumbs({
    companyId,
    box: route.box,
    folderId: route.folderId,
    node: route.node,
    quick: route.quick,
    groupBy,
    groupKey,
    entryTree: entryTree.data,
  });

  /* In-memory history (back/forward), keyed by navigation target, not by selection or view. */
  const pathWithoutSelection = (() => {
    const copy = new URLSearchParams(params);
    copy.delete("sel");
    const search = copy.toString();
    return `${location.pathname}${search ? `?${search}` : ""}`;
  })();
  const navKey = `${location.pathname}|${groupBy ?? ""}|${groupKey ?? ""}`;
  const [history, setHistory] = useState(() => ({
    entries: [{ key: navKey, full: pathWithoutSelection }],
    index: 0,
  }));
  useEffect(() => {
    setHistory((current) => {
      if (current.entries[current.index]?.key === navKey) return current;
      if (current.index > 0 && current.entries[current.index - 1]?.key === navKey) {
        return { ...current, index: current.index - 1 };
      }
      if (current.index < current.entries.length - 1 && current.entries[current.index + 1]?.key === navKey) {
        return { ...current, index: current.index + 1 };
      }
      const entries = [...current.entries.slice(0, current.index + 1), { key: navKey, full: pathWithoutSelection }];
      return { entries, index: entries.length - 1 };
    });
  }, [navKey, pathWithoutSelection]);

  const canBack = history.index > 0;
  const canForward = history.index < history.entries.length - 1;

  const back = useCallback(() => {
    if (history.index <= 0) return;
    navigate(history.entries[history.index - 1]!.full, { replace: false });
  }, [history, navigate]);

  const forward = useCallback(() => {
    if (history.index >= history.entries.length - 1) return;
    navigate(history.entries[history.index + 1]!.full, { replace: false });
  }, [history, navigate]);

  const go = useCallback(
    (target: ExplorerTarget) => {
      const search = new URLSearchParams();
      const keepView = params.get("view");
      const keepPv = params.get("pv");
      if (keepView) search.set("view", keepView);
      if (keepPv) search.set("pv", keepPv);
      if (target.box === "out") {
        if (target.groupBy) search.set("groupBy", target.groupBy);
        if (target.groupKey) search.set("groupKey", target.groupKey);
        const nextSort = target.sort ?? sort;
        const nextDir = target.dir ?? dir;
        if (nextSort !== "name") search.set("sort", nextSort);
        if (nextDir !== "asc") search.set("dir", nextDir);
      } else {
        // Entrada sorts are per view: only a quick view's own sort travels in the URL.
        if (target.sort && target.sort !== "name") search.set("sort", target.sort);
        if (target.dir && target.dir !== "asc") search.set("dir", target.dir);
      }
      const query = search.toString();
      navigate({ pathname: explorerTargetPath(target), search: query ? `?${query}` : "" });
    },
    [dir, navigate, params, sort],
  );

  const up = useCallback(() => {
    if (crumbs.length > 1) go(crumbs[crumbs.length - 2]!.target);
  }, [crumbs, go]);

  const patch = useCallback(
    (values: Record<string, string | null>, replace = true) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(values)) {
            if (value === null || value === "") next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        { replace },
      );
    },
    [setParams],
  );

  const selectItem = useCallback((id: string | null) => patch({ sel: id }), [patch]);

  /** Turns the context view on/off, or narrows it. Clears the selection: the listing changes. */
  const setContextFilter = useCallback(
    (filter: ContextFilter | null) => {
      if (filter) patch({ ...contextFilterParams(filter), sel: null });
      else patch({ context: null, role: null, validity: null, audience: null, projectId: null, sel: null }, false);
    },
    [patch],
  );

  const setQuery = useCallback((text: string) => patch({ q: text.trim() || null, sel: null }), [patch]);

  const toggleSort = useCallback(
    (key: ExplorerSortKey) => {
      if (key === sort) patch({ sort: key === "name" ? null : key, dir: dir === "asc" ? "desc" : null }, true);
      else patch({ sort: key === "name" ? null : key, dir: null }, true);
    },
    [dir, patch, sort],
  );

  const setView = useCallback(
    (next: ExplorerView) => {
      writeStored(VIEW_STORAGE_KEY, next);
      patch({ view: next === "list" ? null : next });
    },
    [patch],
  );

  const setPreviewOpen = useCallback(
    (open: boolean) => {
      writeStored(PREVIEW_STORAGE_KEY, open ? "1" : "0");
      patch({ pv: open ? null : "0" });
    },
    [patch],
  );

  return {
    box: route.box,
    folderId: route.folderId,
    node: route.node,
    quick: route.quick,
    groupBy,
    groupKey,
    sel,
    q,
    contextFilter,
    setContextFilter,
    sort,
    dir,
    view,
    previewOpen,
    crumbs,
    /** Ids of crumbs; the tree expands these ancestors. */
    trailIds: crumbs.map((crumb) => crumb.id),
    canBack,
    canForward,
    canUp: crumbs.length > 1,
    back,
    forward,
    go,
    up,
    selectItem,
    setQuery,
    toggleSort,
    setView,
    setPreviewOpen,
  };
}

/* ---------- keyboard ---------- */

export interface ExplorerKeyboardContext {
  items: ExplorerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (item: ExplorerItem) => void;
  onUp: () => void;
  onPreview: () => void;
  onAction?: (action: "rename" | "delete" | "download", item: ExplorerItem) => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

/**
 * Keyboard model from the mockup: ↑↓ move, Enter opens, Backspace goes up,
 * Space shows the preview, F2 renames, Supr deletes, Ctrl+S downloads.
 * Returns a handler to attach to the file area's onKeyDown.
 */
export function useExplorerKeyboard(context: ExplorerKeyboardContext) {
  const latest = useRef(context);
  latest.current = context;

  return useCallback((event: KeyboardEvent<HTMLElement>) => {
    if (isTypingTarget(event.target)) return;
    const { items, selectedId, onSelect, onOpen, onUp, onPreview, onAction } = latest.current;
    const selected = items.find((item) => item.id === selectedId) ?? null;
    const index = selected ? items.indexOf(selected) : -1;

    if (event.ctrlKey || event.metaKey) {
      if (event.key.toLowerCase() === "s" && selected?.kind === "file" && onAction) {
        event.preventDefault();
        onAction("download", selected);
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        if (items.length === 0) return;
        event.preventDefault();
        const next = items[Math.min(items.length - 1, index + 1)] ?? items[0]!;
        onSelect(next.id);
        return;
      }
      case "ArrowUp": {
        if (items.length === 0) return;
        event.preventDefault();
        const next = items[Math.max(0, index - 1)] ?? items[0]!;
        onSelect(next.id);
        return;
      }
      case "Enter":
        if (selected) {
          event.preventDefault();
          onOpen(selected);
        }
        return;
      case "Backspace":
        event.preventDefault();
        onUp();
        return;
      case " ":
        if (selected) {
          event.preventDefault();
          onPreview();
        }
        return;
      case "F2":
        if (selected && onAction) {
          event.preventDefault();
          onAction("rename", selected);
        }
        return;
      case "Delete":
        if (selected && onAction) {
          event.preventDefault();
          onAction("delete", selected);
        }
        return;
      default:
        return;
    }
  }, []);
}
