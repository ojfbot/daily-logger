// Dark/light mode toggle with localStorage persistence

const STORAGE_KEY = 'daily-logger-theme' as const

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved)
  }

  const btn = document.querySelector('.theme-toggle')
  if (btn) {
    updateLabel(btn as HTMLElement)
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme')
      const isDark = current === 'dark' ||
        (!current && window.matchMedia('(prefers-color-scheme: dark)').matches)
      const next = isDark ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      localStorage.setItem(STORAGE_KEY, next)
      updateLabel(btn as HTMLElement)
    })
  }
}

function updateLabel(btn: HTMLElement): void {
  const current = document.documentElement.getAttribute('data-theme')
  const isDark = current === 'dark' ||
    (!current && window.matchMedia('(prefers-color-scheme: dark)').matches)
  btn.textContent = isDark ? 'LIGHT' : 'DARK'
}
