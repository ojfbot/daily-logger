import { useAppDispatch, useAppSelector } from '../store/hooks.ts'
import { createThread } from '../store/chatSlice.ts'

interface Props {
  section: string
  date: string
  visibleBlobSha?: string
  discussionReady: boolean
}

export function SectionChatButton({ section, date, visibleBlobSha, discussionReady }: Props) {
  const dispatch = useAppDispatch()
  const authorized = useAppSelector((state) => state.auth.user?.authorized)
  if (!authorized) return null

  return (
    <button
      className="section-chat-btn"
      disabled={!visibleBlobSha || !discussionReady}
      title={discussionReady ? `Start discussion about "${section}"` : 'Discussion saving is unavailable until a durable GitHub target is verified'}
      onClick={() => dispatch(createThread({ section, date }))}
      aria-label={`New chat thread for ${section}`}
    >
      +
    </button>
  )
}
