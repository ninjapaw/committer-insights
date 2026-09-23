let localCapability = '';

const launchCapability = new URLSearchParams(window.location.hash.slice(1)).get('session');
if (launchCapability) {
  localCapability = launchCapability;
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

/**
 * Returns the per-launch local capability. Azure tokens never enter the browser.
 */
export async function getPortalApiToken(): Promise<string> {
  if (!localCapability) throw new Error('This local session is invalid. Restart the application.');
  return localCapability;
}

export async function getLocalSession(): Promise<{ authenticated: boolean }> {
  const token = await getPortalApiToken();
  const response = await fetch('/api/session', { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error('Unable to read the local session.');
  return (await response.json()) as { authenticated: boolean };
}

export async function signInLocally(): Promise<void> {
  const token = await getPortalApiToken();
  const response = await fetch('/api/auth/sign-in', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const body = (await response.json()) as { message?: string };
    throw new Error(body.message ?? 'Microsoft sign-in failed.');
  }
}
