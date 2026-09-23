import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportTable } from '../../src/components/ReportTable';
import { githubColumns } from '../../src/providers/github';
import type { GitHubCommitter } from '@ninjapaw/contracts';

describe('shared report table', () => {
  it('shows later rows and resets pagination when filtering', async () => {
    const data: GitHubCommitter[] = Array.from({ length: 12 }, (_, index) => ({
      provider: 'github',
      repository: 'owner/repo',
      login: `person-${index}`,
      commitCount: 1,
      lastCommitAt: '2026-09-23T10:00:00.000Z',
      collectedAt: '2026-09-23T10:00:00.000Z',
      sourceApiVersion: '2022-11-28',
    }));
    const view = render(
      <ReportTable
        data={data}
        columns={githubColumns}
        globalFilter=""
        caption="GitHub committers"
      />,
    );
    expect(screen.queryByText('person-11')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('person-11')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    view.rerender(
      <ReportTable
        data={data}
        columns={githubColumns}
        globalFilter="person-11"
        caption="GitHub committers"
      />,
    );
    await waitFor(() => expect(screen.getByText('Page 1 of 1')).toBeInTheDocument());
    expect(screen.getByText('person-11')).toBeInTheDocument();
    expect(screen.queryByText('person-10')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    view.rerender(
      <ReportTable
        data={data}
        columns={githubColumns}
        globalFilter="missing-person"
        caption="GitHub committers"
      />,
    );
    expect(screen.getByText('No matching committers.')).toBeInTheDocument();
    expect(screen.queryByText('person-11')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});
