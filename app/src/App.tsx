import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './layouts/AppLayout';
import { RequireAuth } from './auth/RequireAuth';
import { LandingPage } from './pages/LandingPage';
import { SecurityPrivacyPage } from './pages/SecurityPrivacyPage';
import { SignInPage } from './pages/SignInPage';
import { ConsentExplanationPage } from './pages/ConsentExplanationPage';
import { OrganizationConfigPage } from './pages/OrganizationConfigPage';
import { ReportConfigurationPage } from './pages/ReportConfigurationPage';
import { ResultsDashboardPage } from './pages/ResultsDashboardPage';
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
          path="/reports/:reportId"
          element={
            <RequireAuth>
              <ResultsDashboardPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppLayout>
  );
}
