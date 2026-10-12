import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
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
import { ProtectedRoute } from "./lib/ProtectedRoute";
import { ThemeProvider } from "./lib/theme";

const protect = (page: ReactNode) => <ProtectedRoute>{page}</ProtectedRoute>;

/** Old per-repo URL — now a filter on the unified pull requests page. */
function LegacyRepoPullsRedirect() {
  const { repoId } = useParams<{ repoId: string }>();
  return <Navigate to={`/pulls?repo=${repoId}`} replace />;
}

export function App() {
  return (
    <ThemeProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
        <Route path="/" element={protect(<DashboardPage />)} />
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
