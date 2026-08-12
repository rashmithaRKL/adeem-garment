import React from 'react';
import ReactDOM from 'react-dom/client';
import { isConfigured } from './lib/env';
import { SetupRequiredPage } from './components/SetupRequiredPage';
import './styles/tokens.css';
import './styles/global.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

// App is imported only once the credentials are known to exist: the Supabase
// client is created at module scope and would throw during evaluation without
// them, which the browser shows as an empty page.
if (isConfigured()) {
  void import('./app/App').then(({ App }) => {
    root.render(<React.StrictMode><App /></React.StrictMode>);
  });
} else {
  root.render(<React.StrictMode><SetupRequiredPage /></React.StrictMode>);
}
