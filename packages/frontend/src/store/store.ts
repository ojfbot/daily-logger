import { configureStore } from '@reduxjs/toolkit'
import { articlesSlice } from './articlesSlice.ts'
import { filterSlice } from './filterSlice.ts'
import { themeSlice } from './themeSlice.ts'

export const store = configureStore({
  reducer: {
    articles: articlesSlice.reducer,
    filters: filterSlice.reducer,
    theme: themeSlice.reducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
