import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { assignmentsApi } from "@/api/assignments";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageSkeleton } from "@/components/PageSkeleton";

export function assignmentTaskCollectionPath(search: string, hash: string) {
  const params = new URLSearchParams(search);
  params.set("review", "required");
  return `/issues?${params.toString()}${hash}`;
}

export function assignmentTaskPath(identifier: string, search: string, hash: string) {
  return `/issues/${identifier}${search}${hash || "#outcome"}`;
}

/** Compatibility destination for saved links; the task collection owns discovery. */
export function Assignments() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    navigate(assignmentTaskCollectionPath(location.search, location.hash), { replace: true, state: location.state });
  }, [location.hash, location.search, location.state, navigate]);
  return null;
}

/** Resolve a legacy assignment URL through its existing root task. */
export function AssignmentDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ["assignment", id], queryFn: () => assignmentsApi.get(id), enabled: !!id });

  useEffect(() => {
    const task = query.data?.rootIssue;
    if (task) navigate(assignmentTaskPath(task.identifier ?? task.id, location.search, location.hash), { replace: true, state: location.state });
  }, [location.hash, location.search, location.state, navigate, query.data?.rootIssue]);

  if (query.isLoading) return <PageSkeleton variant="detail" />;
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;
  if (query.data?.rootIssue) return null;
  return (
    <Card>
      <CardHeader><CardTitle>{t("uxWork.taskUnavailable", { defaultValue: "La tarea asociada no está disponible" })}</CardTitle></CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">{t("uxWork.taskUnavailableHelp", { defaultValue: "El registro de resultado se conserva para recuperación; no se creó otra tarea al abrir este enlace." })}</p>
        <Button asChild><Link to={assignmentTaskCollectionPath(location.search, location.hash)} state={location.state}>{t("uxWork.openTasks", { defaultValue: "Abrir tareas" })}</Link></Button>
      </CardContent>
    </Card>
  );
}
