import { useAppDispatch } from '../store/hooks.ts'
import { createThread } from '../store/chatSlice.ts'

interface Props {
  section: string
  date: string
}

export function SectionChatButton({ section, date }: Props) {
  const dispatch = useAppDispatch()

  return (
    <button
      className="section-chat-btn"
      title={`Start chat thread about "${section}"`}
      onClick={() => dispatch(createThread({ section, date }))}
      aria-label={`New chat thread for ${section}`}
    >
      +
    </button>
  )
}
