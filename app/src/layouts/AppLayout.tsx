import type { PropsWithChildren } from 'react';

export function AppLayout({ children }: PropsWithChildren): JSX.Element {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <main id="main-content">{children}</main>
    </>
  );
}
