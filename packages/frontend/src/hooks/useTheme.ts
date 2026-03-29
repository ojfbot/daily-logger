import { useEffect } from 'react'
import { useAppSelector } from '../store/hooks.ts'

export function useTheme() {
  const mode = useAppSelector((s) => s.theme.mode)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', mode)
  }, [mode])

  return mode
}
