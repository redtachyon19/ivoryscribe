import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/index.css'
import App from './App.tsx'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Unable to find #root mount element')
}

createRoot(rootElement).render(<App />)
