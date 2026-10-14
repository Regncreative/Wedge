import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { api } from './lib/api'
import './styles/globals.css'

window.stash = api

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
