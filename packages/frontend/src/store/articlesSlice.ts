import { createSlice, createAsyncThunk } from '@reduxjs/toolkit'
import type { EntryData, TagCount, RepoStats, ActionItem } from './types.ts'

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`)
  return res.json() as Promise<T>
}

export interface ArticleDetail extends EntryData {
  bodyHtml: string
}

export const fetchEntries = createAsyncThunk('articles/fetchEntries', () =>
  fetchJSON<EntryData[]>('/api/entries.json'),
)

export const fetchTags = createAsyncThunk('articles/fetchTags', () =>
  fetchJSON<TagCount[]>('/api/tags.json'),
)

export const fetchRepos = createAsyncThunk('articles/fetchRepos', () =>
  fetchJSON<RepoStats[]>('/api/repos.json'),
)

export const fetchActions = createAsyncThunk('articles/fetchActions', () =>
  fetchJSON<ActionItem[]>('/api/actions.json'),
)

export const fetchDoneActions = createAsyncThunk('articles/fetchDoneActions', () =>
  fetchJSON<ActionItem[]>('/api/done-actions.json').catch(() => []),
)

export const fetchArticle = createAsyncThunk(
  'articles/fetchArticle',
  (date: string) => fetchJSON<ArticleDetail>(`/api/articles/${date}.json`),
)

interface ArticlesState {
  entries: EntryData[]
  tags: TagCount[]
  repos: RepoStats[]
  actions: ActionItem[]
  doneActions: ActionItem[]
  articleCache: Record<string, ArticleDetail>
  articleLoading: boolean
  loading: boolean
  error: string | null
}

const initialState: ArticlesState = {
  entries: [],
  tags: [],
  repos: [],
  actions: [],
  doneActions: [],
  articleCache: {},
  articleLoading: false,
  loading: false,
  error: null,
}

export const articlesSlice = createSlice({
  name: 'articles',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchEntries.pending, (state) => { state.loading = true; state.error = null })
      .addCase(fetchEntries.fulfilled, (state, action) => { state.entries = action.payload; state.loading = false })
      .addCase(fetchEntries.rejected, (state, action) => { state.error = action.error.message ?? 'Failed to load'; state.loading = false })
      .addCase(fetchTags.fulfilled, (state, action) => { state.tags = action.payload })
      .addCase(fetchRepos.fulfilled, (state, action) => { state.repos = action.payload })
      .addCase(fetchActions.fulfilled, (state, action) => { state.actions = action.payload })
      .addCase(fetchDoneActions.fulfilled, (state, action) => { state.doneActions = action.payload })
      .addCase(fetchArticle.pending, (state) => { state.articleLoading = true })
      .addCase(fetchArticle.fulfilled, (state, action) => {
        state.articleCache[action.payload.date] = action.payload
        state.articleLoading = false
      })
      .addCase(fetchArticle.rejected, (state) => { state.articleLoading = false })
  },
})
