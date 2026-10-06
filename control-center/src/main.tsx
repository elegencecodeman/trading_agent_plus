import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { I18nProvider } from './lib/i18n'
import { Inspector } from 'react-dev-inspector'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </I18nProvider>
    {/*
      hotkeys-js treats the LAST entry as the trigger key and every earlier one
      as a modifier, and it rejects a keydown whose key is itself a modifier.
      `['alt','shift']` therefore binds "Shift pressed while Alt is held", which
      can never match — the combo stays silent. A non-modifier terminator is
      required: Alt+Shift+Z.
    */}
    {import.meta.env.DEV && <Inspector keys={['alt', 'shift', 'z']} />}
  </React.StrictMode>,
)
