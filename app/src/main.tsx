import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { msalInstance } from './auth/msal-instance';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

void msalInstance.initialize().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <FluentProvider theme={webLightTheme}>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </QueryClientProvider>
        </FluentProvider>
      </MsalProvider>
    </StrictMode>,
  );
});
