import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { SyncToast } from './components/SyncToast';
import { ToastProvider } from './components/ui';
import { DataProvider } from './state';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DataProvider>
        <ToastProvider>
          <App />
          <SyncToast />
        </ToastProvider>
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
