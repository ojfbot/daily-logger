import { useEffect, useLayoutEffect, useRef } from 'react'

function fitEditorialInput(input: HTMLTextAreaElement) {
  const previousHeight = input.getBoundingClientRect().height
  const scrollTop = input.scrollTop
  input.style.setProperty('--editorial-viewport-height', `${window.visualViewport?.height ?? window.innerHeight}px`)
  input.style.height = 'auto'
  const style = getComputedStyle(input)
  input.style.height = `${input.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)}px`
  input.scrollTop = scrollTop
  if (document.activeElement === input && input.getBoundingClientRect().height !== previousHeight) {
    input.scrollIntoView?.({ block: 'nearest' })
  }
}

export function EditorialInput({ id, content, disabled, onChange }: {
  id: string
  content: string
  disabled: boolean
  onChange: (content: string) => void
}) {
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    if (inputRef.current) fitEditorialInput(inputRef.current)
  }, [content])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const fit = () => fitEditorialInput(input)
    let width = input.getBoundingClientRect().width
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => {
      const nextWidth = input.getBoundingClientRect().width
      if (nextWidth !== width) {
        width = nextWidth
        fit()
      }
    })
    observer?.observe(input)
    const viewport = window.visualViewport
    window.addEventListener('resize', fit)
    viewport?.addEventListener('resize', fit)
    document.fonts?.addEventListener('loadingdone', fit)
    let active = true
    void document.fonts?.ready.then(() => { if (active) fit() })
    return () => {
      active = false
      observer?.disconnect()
      window.removeEventListener('resize', fit)
      viewport?.removeEventListener('resize', fit)
      document.fonts?.removeEventListener('loadingdone', fit)
    }
  }, [])

  return <textarea
    ref={inputRef}
    id={id}
    className="editorial-input"
    placeholder="Suggest an edit to this article..."
    value={content}
    disabled={disabled}
    onChange={(event) => onChange(event.currentTarget.value)}
    rows={3}
  />
}

