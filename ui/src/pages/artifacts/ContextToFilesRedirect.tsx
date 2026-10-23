import { Navigate, useLocation } from "@/lib/router";

/** Search string of the Files explorer's context view for a retired `/artifacts/context` URL. */
export function contextRedirectSearch(search: string): string {
  const params = new URLSearchParams(search);
  params.set("context", "1");
  return `?${params.toString()}`;
}

/**
 * The old Context page lives in the Files explorer as its context view. Keeps `projectId`
 * (the project's "reference files" link) and any other param, and the hash.
 */
export function ContextToFilesRedirect() {
  const location = useLocation();
  return <Navigate to={{ pathname: "/artifacts", search: contextRedirectSearch(location.search), hash: location.hash }} replace state={location.state} />;
}
