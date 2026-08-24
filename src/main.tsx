import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const root = document.getElementById('root')!
const app = (
  <StrictMode>
    <App />
  </StrictMode>
)

// При публикации платформа рендерит приложение в HTML (это нужно поисковикам) и метит корень
// атрибутом data-vb-ssr. Только такую разметку можно подхватить гидрацией; любое другое
// содержимое корня (например, свой прелоадер) рендерим заново.
if (root.hasAttribute('data-vb-ssr')) hydrateRoot(root, app)
else createRoot(root).render(app)
