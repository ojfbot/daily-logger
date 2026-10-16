import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { createThread } from '../store/chatSlice.ts'

interface Props {
  section: string
  date: string
  visibleBlobSha?: string
}

export function SectionChatButton({ section, date, visibleBlobSha }: Props) {
  const dispatch = useAppDispatch()
  const authorized = useAppSelector((state) => state.auth.user?.authorized)
  if (!authorized) return null

  return (
    <button
      className="section-chat-btn"
      disabled={!visibleBlobSha}
      title={`Start chat thread about "${section}"`}
      onClick={() => dispatch(createThread({ section, date }))}
      aria-label={`New chat thread for ${section}`}
    >
      +
    </button>
  )
}
