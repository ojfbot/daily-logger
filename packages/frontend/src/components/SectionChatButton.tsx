import { useAppDispatch } from '../store/hooks.ts'
import { openChat } from '../store/chatSlice.ts'

interface Props {
  section: string
  date: string
}

export function SectionChatButton({ section, date }: Props) {
  const dispatch = useAppDispatch()

  return (
    <button
      className="section-chat-btn"
      title={`Chat about "${section}"`}
      onClick={() => dispatch(openChat({ section, date }))}
      aria-label={`Open chat for ${section}`}
    >
      ›
    </button>
  )
}
