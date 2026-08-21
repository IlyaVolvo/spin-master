import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { applyBrowserDocumentTitle } from './brand';
import './index.css';

applyBrowserDocumentTitle();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
