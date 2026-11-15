import React from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App'
import { AudioSettingsProvider } from './contexts/AudioSettingsContext'

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <AudioSettingsProvider>
            <App/>
        </AudioSettingsProvider>
    </React.StrictMode>
)
