import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { LogoMark } from "../components/icons";
import { useCurrentUser } from "../lib/use-current-user";

/** Signed-in users only. By default they must also belong to an
 * organization — everyone else is sent to /welcome to create one. The
 * welcome page itself passes `withoutOrganization`, which inverts that:
 * someone who already has an organization goes on to the dashboard. */
export function ProtectedRoute({
  children,
  withoutOrganization = false,
}: {
  children: ReactNode;
  withoutOrganization?: boolean;
}) {
  const { data: user, isLoading, isError } = useCurrentUser();

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 dark:bg-canvas" role="status">
        <LogoMark size={48} className="animate-pulse" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />;
  }

  const hasOrganization = user.organizations.length > 0;
  if (withoutOrganization && hasOrganization) {
    return <Navigate to="/" replace />;
  }
  if (!withoutOrganization && !hasOrganization) {
    return <Navigate to="/welcome" replace />;
  }

  return <>{children}</>;
}
