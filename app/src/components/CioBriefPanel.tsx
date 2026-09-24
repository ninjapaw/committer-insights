import { useState } from 'react';
import {
  buildCioBrief,
  cioAiReviewBrief,
  cioMethodology,
  type Report,
  type ReportingProvider,
} from '@ninjapaw/contracts';

export function CioBriefPanel({ report }: { report: Report }): JSX.Element {
  const brief = buildCioBrief(report, report.provider as ReportingProvider);
  const [copyStatus, setCopyStatus] = useState('');
  const aiBrief = cioAiReviewBrief(brief);
  const copyBrief = async () => {
    try {
      await navigator.clipboard.writeText(aiBrief);
      setCopyStatus('Aggregate brief copied. Nothing was sent to an AI service.');
    } catch {
      setCopyStatus('Clipboard unavailable. The aggregate brief is available below.');
    }
  };
  return (
    <section aria-labelledby="cio-summary-title" className="cio-brief">
      <h3 id="cio-summary-title">CIO decision brief</h3>
      <p>
        <strong>Decision readiness: {brief.readiness}</strong>
      </p>
      <p>{brief.narrative}</p>
      <p className="insight-note">{cioMethodology}</p>
      <div className="table-scroll" role="region" aria-label="CIO action priorities" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Priority</th>
              <th scope="col">Recommendation</th>
              <th scope="col">Owner / horizon</th>
            </tr>
          </thead>
          <tbody>
            {brief.recommendations.map((item) => (
              <tr key={item.title}>
                <td>{item.priority}</td>
                <th scope="row">
                  <details className="recommendation-detail">
                    <summary>{item.title}</summary>
                    <p>{item.action}</p>
                    <dl>
                      {brief.facts
                        .filter((fact) =>
                          item.evidence
                            .split(',')
                            .map((id) => id.trim())
                            .includes(fact.id),
                        )
                        .map((fact) => (
                          <div key={fact.id}>
                            <dt>{fact.id}</dt>
                            <dd>{fact.text}</dd>
                          </div>
                        ))}
                    </dl>
                  </details>
                </th>
                <td>
                  {item.owner}
                  <br />
                  {item.horizon}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Decision evidence</summary>
        <dl>
          {brief.facts.map((fact) => (
            <div key={fact.id}>
              <dt>
                <strong>{fact.id}</strong>
              </dt>
              <dd>{fact.text}</dd>
            </div>
          ))}
        </dl>
      </details>
      <details>
        <summary>Additional collection priorities</summary>
        <ol>
          {brief.collection.map((item) => (
            <li key={item.dataset}>
              <strong>{item.dataset}</strong>
              <p>{item.decision}</p>
              <p className="insight-note">{item.access}</p>
            </li>
          ))}
        </ol>
      </details>
      <details>
        <summary>AI review brief</summary>
        <p>
          No AI model is connected. This aggregate brief may still disclose confidential business
          scale. Review it before sharing with an approved AI service.
        </p>
        <button type="button" onClick={() => void copyBrief()}>
          Copy AI review brief
        </button>
        <p role="status">{copyStatus}</p>
        <textarea aria-label="Aggregate AI review brief" readOnly value={aiBrief} rows={12} />
      </details>
    </section>
  );
}
