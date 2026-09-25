import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles.css';

declare const __DEVELOPER_USAGE_INSIGHTS_THEME__: string | undefined;

const themeName = __DEVELOPER_USAGE_INSIGHTS_THEME__ === 'light' ? 'light' : 'dark';
const fluentTheme = themeName === 'light' ? webLightTheme : webDarkTheme;

document.documentElement.dataset.theme = themeName;

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FluentProvider theme={fluentTheme}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </FluentProvider>
  </StrictMode>,
);
