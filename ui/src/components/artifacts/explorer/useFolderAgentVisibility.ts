import { useMutation, useQueryClient } from "@tanstack/react-query";
import { companyFilesApi, type CompanyFileFolderNode } from "@/api/company-files";
import { queryKeys } from "@/lib/queryKeys";

interface FolderVisibilityInput {
  folderId: string;
  agentVisible: boolean;
}

/** Sets `agentVisible` on one folder wherever it appears in a cached tree or list response. */
function applyFolderVisibility(data: unknown, folderId: string, agentVisible: boolean): unknown {
  if (!data) return data;
  const mapTree = (nodes: CompanyFileFolderNode[]): CompanyFileFolderNode[] =>
    nodes.map((node) =>
      node.id === folderId
        ? { ...node, agentVisible, children: node.children }
        : { ...node, children: mapTree(node.children ?? []) },
    );
  if (Array.isArray(data)) return mapTree(data as CompanyFileFolderNode[]);
  if (typeof data === "object") {
    const response = data as { folders?: CompanyFileFolderNode[]; folder?: CompanyFileFolderNode | null };
    const next: Record<string, unknown> = { ...response };
    if (Array.isArray(response.folders)) next.folders = mapTree(response.folders);
    if (response.folder && response.folder.id === folderId) next.folder = { ...response.folder, agentVisible };
    return next;
  }
  return data;
}

/**
 * Toggles whether agents can see a folder. Updates the cached tree and lists at once
 * (optimistic), rolls back on failure and refetches the company files either way.
 */
export function useFolderAgentVisibility(companyId: string, options: { onError?: (error: unknown) => void } = {}) {
  const queryClient = useQueryClient();
  const prefix = queryKeys.companyFiles.all(companyId);
  return useMutation({
    mutationFn: ({ folderId, agentVisible }: FolderVisibilityInput) =>
      companyFilesApi.updateFolder(folderId, { agentVisible }),
    onMutate: async ({ folderId, agentVisible }) => {
      await queryClient.cancelQueries({ queryKey: prefix });
      const snapshots = queryClient.getQueriesData({ queryKey: prefix });
      queryClient.setQueriesData({ queryKey: prefix }, (data: unknown) => applyFolderVisibility(data, folderId, agentVisible));
      return { snapshots };
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, data);
      }
      options.onError?.(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: prefix }),
  });
}
