import React from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import './i18n'
import App from './App'
import { PlayerSettingsProvider } from './contexts/PlayerSettingsContext'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <PlayerSettingsProvider>
            <App/>
        </PlayerSettingsProvider>
    </React.StrictMode>
)
