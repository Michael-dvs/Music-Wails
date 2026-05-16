import React from 'react'
import {createRoot} from 'react-dom/client'
import './index.css'
import App from './App'

// ── Theme Bootstrapping ──
const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const activeTheme = savedTheme || (systemPrefersDark ? 'dark' : 'light');

if (activeTheme === 'dark') {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

const container = document.getElementById('root')

const root = createRoot(container!)

root.render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>
)
