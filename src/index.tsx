import { ReactiveElement } from '@lit/reactive-element';
ReactiveElement.disableWarning?.('change-in-update');

import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App.tsx';
import './index.css';
import { SettingsProvider, ImageProvider } from './settings';
import { E621Provider } from './e621';
import { LocalImageProvider } from './local/LocalProvider.tsx';
import { registerServiceWorker } from './utils/serviceWorker.ts';
import { installLocalIcons } from './utils/localIcons.ts';

registerServiceWorker();
// Icons come from the bundle, not the Font Awesome CDN (works offline).
installLocalIcons();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SettingsProvider>
      <ImageProvider>
        <LocalImageProvider>
          <E621Provider>
            <App />
          </E621Provider>
        </LocalImageProvider>
      </ImageProvider>
    </SettingsProvider>
  </React.StrictMode>
);
