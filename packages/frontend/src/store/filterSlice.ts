import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface FilterState {
  active: Record<string, string[]>
}

const initialState: FilterState = {
  active: {},
}

export const filterSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    toggleFilter(state, action: PayloadAction<{ type: string; name: string }>) {
      const { type, name } = action.payload
      const current = state.active[type] ?? []
      const idx = current.indexOf(name)
      if (idx >= 0) {
        current.splice(idx, 1)
        if (current.length === 0) {
          delete state.active[type]
        } else {
          state.active[type] = current
        }
      } else {
        state.active[type] = [...current, name]
      }
    },
    setFiltersFromHash(state, action: PayloadAction<Record<string, string[]>>) {
      state.active = action.payload
    },
    clearFilters(state) {
      state.active = {}
    },
  },
})

export const { toggleFilter, setFiltersFromHash, clearFilters } = filterSlice.actions
