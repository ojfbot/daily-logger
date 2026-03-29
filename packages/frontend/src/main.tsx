import './styles/dashboard.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { store } from './store/store.ts'
import { App } from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <BrowserRouter basename="/daily-logger">
        <App />
      </BrowserRouter>
    </Provider>
  </StrictMode>,
)
