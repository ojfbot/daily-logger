import { createSlice } from '@reduxjs/toolkit'

const STORAGE_KEY = 'dl-theme'

function getInitialTheme(): 'light' | 'dark' {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch { /* ignore */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

interface ThemeState {
  mode: 'light' | 'dark'
}

const initialState: ThemeState = {
  mode: getInitialTheme(),
}

export const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleTheme(state) {
      state.mode = state.mode === 'light' ? 'dark' : 'light'
      try { localStorage.setItem(STORAGE_KEY, state.mode) } catch { /* ignore */ }
      document.documentElement.setAttribute('data-theme', state.mode)
    },
  },
})

export const { toggleTheme } = themeSlice.actions
