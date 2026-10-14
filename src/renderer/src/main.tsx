import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { api } from './lib/api'
import { installFileDrop } from './lib/file-drop'
import { EdgeView } from './views/edge'
import { WidgetView } from './views/widget'
import './styles/globals.css'

window.stash = api
installFileDrop()

// One bundle serves every window; the URL picks the view.
const params = new URLSearchParams(window.location.search)
const view = params.get('view')
const shelf = params.get('shelf')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {view === 'edge' ? (
      <EdgeView side={params.get('side') === 'left' ? 'left' : 'right'} />
    ) : view === 'widget' && shelf ? (
      <WidgetView shelfId={shelf} />
    ) : (
      <App />
    )}
  </React.StrictMode>
)
