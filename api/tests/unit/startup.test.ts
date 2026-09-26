import { afterEach, describe, expect, it, vi } from 'vitest';

const startup = vi.hoisted(() => ({
  prepare: vi.fn(),
  server: vi.fn(),
  update: vi.fn(),
  notice: vi.fn(),
  sea: true,
  help: false,
  version: false,
  skipUpdateCheck: false,
}));
vi.mock('node:sea', () => ({ isSea: () => startup.sea }));
vi.mock('../../src/auth/azure-cli-binary.js', () => ({ prepareAzureCli: startup.prepare }));
vi.mock('../../src/local-server.js', () => ({ startLocalServer: startup.server }));
vi.mock('../../src/release-updater.js', () => ({
  launchLatestRelease: startup.update,
  reportAvailableUpdate: startup.notice,
}));
vi.mock('../../src/cli.js', () => ({
  launchHelp: 'help',
  launchVersion: 'version',
  parseLaunchOptions: () => ({
    help: startup.help,
    version: startup.version,
    timeZone: 'UTC',
    skipUpdateCheck: startup.skipUpdateCheck,
  }),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  vi.resetModules();
  startup.sea = true;
  startup.help = false;
  startup.version = false;
  startup.skipUpdateCheck = false;
});

describe('application startup preparation', () => {
  it('starts the installed application without calling the updater when disabled', async () => {
    startup.skipUpdateCheck = true;
    startup.sea = false;
    await import('../../src/index.js');
    await vi.waitFor(() => expect(startup.server).toHaveBeenCalledOnce());
    expect(startup.update).not.toHaveBeenCalled();
    expect(startup.notice).not.toHaveBeenCalled();
  });
  it('reports available releases for bundle installs that cannot self-update', async () => {
    startup.sea = false;
    startup.update.mockResolvedValue(false);
    await import('../../src/index.js');
    await vi.waitFor(() => expect(startup.server).toHaveBeenCalledOnce());
    expect(startup.notice).toHaveBeenCalledOnce();
  });
  it.skipIf(process.platform !== 'win32')(
    'prepares before opening the app without signing in',
    async () => {
      let complete!: () => void;
      startup.prepare.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            complete = resolve;
          }),
      );
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      await import('../../src/index.js');
      await vi.waitFor(() => expect(startup.prepare).toHaveBeenCalledOnce());
      expect(startup.server).not.toHaveBeenCalled();
      startup.prepare.mock.calls[0]![0]('Verifying Microsoft sign-in runtime: 2 of 2 files...');
      expect(output).toHaveBeenCalledWith('Verifying Microsoft sign-in runtime: 2 of 2 files...\n');
      complete();
      await vi.waitFor(() => expect(startup.server).toHaveBeenCalledOnce());
      expect(output).toHaveBeenCalledWith('Microsoft sign-in runtime ready.\n');
    },
  );

  it.skipIf(process.platform !== 'win32')(
    'keeps the app available if Microsoft preparation fails',
    async () => {
      startup.prepare.mockRejectedValue(new Error('private details'));
      const output = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
      await import('../../src/index.js');
      await vi.waitFor(() => expect(startup.server).toHaveBeenCalledOnce());
      expect(output).toHaveBeenCalledWith(expect.stringContaining('Restart the app to retry'));
      expect(output.mock.calls.flat().join('')).not.toContain('private details');
    },
  );

  it('does not prepare for source runs', async () => {
    startup.sea = false;
    await import('../../src/index.js');
    await vi.waitFor(() => expect(startup.server).toHaveBeenCalledOnce());
    expect(startup.prepare).not.toHaveBeenCalled();
  });

  it('does not prepare before an update handoff', async () => {
    startup.update.mockResolvedValue(true);
    await import('../../src/index.js');
    expect(startup.update).toHaveBeenCalledOnce();
    expect(startup.prepare).not.toHaveBeenCalled();
    expect(startup.server).not.toHaveBeenCalled();
  });

  it('does not prepare for help', async () => {
    startup.help = true;
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await import('../../src/index.js');
    expect(startup.prepare).not.toHaveBeenCalled();
    expect(startup.server).not.toHaveBeenCalled();
  });

  it('reports the release without contacting GitHub or starting the app', async () => {
    startup.version = true;
    const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    await import('../../src/index.js');
    expect(output).toHaveBeenCalledWith('version');
    expect(startup.update).not.toHaveBeenCalled();
    expect(startup.notice).not.toHaveBeenCalled();
    expect(startup.prepare).not.toHaveBeenCalled();
    expect(startup.server).not.toHaveBeenCalled();
  });
});
