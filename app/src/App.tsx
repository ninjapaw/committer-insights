import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { LandingPage } from './pages/LandingPage';
import { SecurityPrivacyPage } from './pages/SecurityPrivacyPage';
import { SignInPage } from './pages/SignInPage';
import { ConsentExplanationPage } from './pages/ConsentExplanationPage';
import { ResultsDashboardPage } from './pages/ResultsDashboardPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { GitHubConnectPage } from './pages/GitHubConnectPage';
import { CombinedReportPage } from './pages/CombinedReportPage';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/security-privacy" element={<SecurityPrivacyPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/connect" element={<ConsentExplanationPage />} />
        <Route path="/connect/github" element={<GitHubConnectPage />} />
        <Route path="/connections" element={<CombinedReportPage />} />
        <Route
          path="/connections/github/repository"
          element={<Navigate to="/connections" replace />}
        />
        <Route path="/reports/combined" element={<Navigate to="/connections" replace />} />
        <Route
          path="/connections/azure-devops/organization"
          element={<Navigate to="/connections" replace />}
        />
        <Route path="/reports/new" element={<Navigate to="/connections" replace />} />
        <Route path="/reports/:reportId" element={<ResultsDashboardPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  );
}
