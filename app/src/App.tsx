import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth } from './auth/RequireAuth';
import { LandingPage } from './pages/LandingPage';
import { SecurityPrivacyPage } from './pages/SecurityPrivacyPage';
import { SignInPage } from './pages/SignInPage';
import { ConsentExplanationPage } from './pages/ConsentExplanationPage';
import { ConnectionSetupPage } from './pages/ConnectionSetupPage';
import { OrganizationConfigPage } from './pages/OrganizationConfigPage';
import { ReportConfigurationPage } from './pages/ReportConfigurationPage';
import { ReportProgressPage } from './pages/ReportProgressPage';
import { ResultsDashboardPage } from './pages/ResultsDashboardPage';
import { IdentityReviewPage } from './pages/IdentityReviewPage';
import { ReportHistoryPage } from './pages/ReportHistoryPage';
import { ConnectionManagementPage } from './pages/ConnectionManagementPage';
import { AccessDeniedPage } from './pages/AccessDeniedPage';
import { ConsentRequiredPage } from './pages/ConsentRequiredPage';
import { ErrorPage } from './pages/ErrorPage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/security-privacy" element={<SecurityPrivacyPage />} />
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/connect" element={<ConsentExplanationPage />} />
        <Route
          path="/connections/setup"
          element={
            <RequireAuth>
              <ConnectionSetupPage />
            </RequireAuth>
          }
        />
        <Route
          path="/connections/azure-devops/organization"
          element={
            <RequireAuth>
              <OrganizationConfigPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports/new"
          element={
            <RequireAuth>
              <ReportConfigurationPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:reportId/progress"
          element={
            <RequireAuth>
              <ReportProgressPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:reportId"
          element={
            <RequireAuth>
              <ResultsDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports/:reportId/identity-review"
          element={
            <RequireAuth>
              <IdentityReviewPage />
            </RequireAuth>
          }
        />
        <Route
          path="/reports"
          element={
            <RequireAuth>
              <ReportHistoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/connections"
          element={
            <RequireAuth>
              <ConnectionManagementPage />
            </RequireAuth>
          }
        />
        <Route path="/access-denied" element={<AccessDeniedPage />} />
        <Route path="/consent-required" element={<ConsentRequiredPage />} />
        <Route path="/error" element={<ErrorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  );
}
