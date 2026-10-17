import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { AboutPage } from "./pages/AboutPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RepositoriesPage } from "./pages/RepositoriesPage";
import { PullRequestsPage } from "./pages/PullRequestsPage";
import { PullRequestDetailPage } from "./pages/PullRequestDetailPage";
import { WelcomePage } from "./pages/WelcomePage";
import { InvitePage } from "./pages/InvitePage";
import { MembersPage } from "./pages/MembersPage";
import { ProtectedRoute, SessionCheck } from "./lib/ProtectedRoute";
import { useCurrentUser } from "./lib/use-current-user";
import { ThemeProvider } from "./lib/theme";

const protect = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

/** Old per-repo URL — now a filter on the unified pull requests page. */
function LegacyRepoPullsRedirect() {
  const { repoId } = useParams<{ repoId: string }>();
  return <Navigate to={`/pulls?repo=${repoId}`} replace />;
}

/** The site's front door: the landing page for visitors, the dashboard
 * once signed in. Keeps mergewise.in/ the one shareable, indexable URL. */
function HomeRoute() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return <SessionCheck />;
  return user ? protect(<DashboardPage />) : <LoginPage />;
}

/** /login is kept for links already out there (and the API's
 * ?error=oauth_failed redirect); the landing page itself lives at /. */
function LoginRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/", search, hash }} replace />;
}

export function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route
          path="/welcome"
          element={
            <ProtectedRoute withoutOrganization>
              <WelcomePage />
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<HomeRoute />} />
        <Route path="/pulls" element={protect(<PullRequestsPage />)} />
        <Route path="/pulls/:pullId" element={protect(<PullRequestDetailPage />)} />
        <Route path="/repositories" element={protect(<RepositoriesPage />)} />
        <Route path="/members" element={protect(<MembersPage />)} />
        <Route path="/repositories/:repoId/pulls" element={<LegacyRepoPullsRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ThemeProvider>
  );
}
