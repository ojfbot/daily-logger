import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'

export interface AuthUser {
  login: string
  avatarUrl: string
  name: string | null
  authorized: boolean
}

interface AuthState {
  user: AuthUser | null
  loading: boolean
  checked: boolean // true after initial /api/auth/me check completes
}

const initialState: AuthState = {
  user: null,
  loading: false,
  checked: false,
}

/**
 * Check if the user is authenticated by calling /api/auth/me.
 * The token lives in an httpOnly cookie — this endpoint reads it server-side.
 */
export const checkAuth = createAsyncThunk('auth/checkAuth', async () => {
  // Dev mode: simulate authenticated user (Vite dev server only, never in production builds)
  if (import.meta.env.DEV) {
    return { login: 'dev', avatarUrl: '', name: 'Dev Mode', authorized: true } as AuthUser
  }

  const res = await fetch('/api/auth/me', { credentials: 'same-origin' })
  if (!res.ok) return null
  return res.json() as Promise<AuthUser>
})

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuth(state) {
      state.user = null
      state.checked = true
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkAuth.pending, (state) => {
        state.loading = true
      })
      .addCase(checkAuth.fulfilled, (state, action) => {
        state.user = action.payload
        state.loading = false
        state.checked = true
      })
      .addCase(checkAuth.rejected, (state) => {
        state.user = null
        state.loading = false
        state.checked = true
      })
  },
})

export const { clearAuth } = authSlice.actions
