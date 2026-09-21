import { useParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

export function ReportProgressPage(): JSX.Element {
  const { reportId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (reportId) navigate(`/reports/${reportId}`, { replace: true });
  }, [reportId, navigate]);

  return (
    <section aria-labelledby="progress-title">
      <h1 id="progress-title">Generating your report</h1>
      <p aria-live="polite">Contacting Azure DevOps and preparing your results...</p>
    </section>
  );
}
