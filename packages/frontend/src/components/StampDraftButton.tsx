import { useState } from 'react'
import { useAppSelector } from '../store/hooks.ts'
import { stampDraft } from '../utils/stampDraft.ts'

interface StampDraftButtonProps {
  date: string
  articleTitle: string
}

type StampState = 'idle' | 'loading' | 'success' | 'error'

export function StampDraftButton({ date, articleTitle }: StampDraftButtonProps) {
  const { user } = useAppSelector((s) => s.auth)
  const [state, setState] = useState<StampState>('idle')
  const [prUrl, setPrUrl] = useState<string | null>(null)
  const [prNumber, setPrNumber] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Only show for authenticated + authorized users
  if (!user?.authorized) return null

  async function handleStamp() {
    setState('loading')
    setErrorMsg(null)

    try {
      const result = await stampDraft(date, articleTitle, user!.login)
      setPrUrl(result.prUrl)
      setPrNumber(result.prNumber)
      setState('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to stamp draft')
      setState('error')
    }
  }

  if (state === 'success' && prUrl) {
    return (
      <div className="stamp-draft-result stamp-success">
        <span className="stamp-check">&#10003;</span>
        PR #{prNumber} opened &mdash;{' '}
        <a href={prUrl} target="_blank" rel="noopener noreferrer">
          View in GitHub
        </a>
      </div>
    )
  }

  return (
    <div className="stamp-draft-container">
      <button
        className={`stamp-draft-btn${state === 'error' ? ' stamp-error' : ''}`}
        onClick={handleStamp}
        disabled={state === 'loading'}
      >
        {state === 'loading' ? 'OPENING PR...' : 'ACCEPT DRAFT'}
      </button>
      {state === 'error' && errorMsg && (
        <div className="stamp-error-msg">{errorMsg}</div>
      )}
    </div>
  )
}
