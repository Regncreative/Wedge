import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { api } from './lib/api'
import { installFileDrop } from './lib/file-drop'
import { WidgetView } from './views/widget'
import '@fontsource-variable/bricolage-grotesque'
import '@fontsource/instrument-sans/latin-400.css'
import '@fontsource/instrument-sans/latin-500.css'
import '@fontsource/instrument-sans/latin-600.css'
import '@fontsource/instrument-sans/latin-ext-400.css'
import '@fontsource/instrument-sans/latin-ext-500.css'
import '@fontsource/instrument-sans/latin-ext-600.css'
import '@fontsource/martian-mono/latin-400.css'
import '@fontsource/martian-mono/latin-500.css'
import '@fontsource/martian-mono/latin-ext-400.css'
import '@fontsource/martian-mono/latin-ext-500.css'
import './styles/globals.css'

window.stash = api
installFileDrop()

// One bundle serves every window; the URL picks the view.
const params = new URLSearchParams(window.location.search)
const view = params.get('view')
const shelf = params.get('shelf')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'widget' && shelf ? <WidgetView shelfId={shelf} /> : <App />}
  </React.StrictMode>
)
