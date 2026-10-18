import { useAppSelector } from '../store/hooks.ts'
import { EditorialEditor } from './EditorialEditor.tsx'

interface Props {
  date: string
  articleTitle: string
  visibleBlobSha?: string
  actionChoicesReady?: boolean
}

export function EditorialSidebar({ date, articleTitle, visibleBlobSha, actionChoicesReady }: Props) {
  const { user } = useAppSelector((s) => s.auth)
  if (!user?.authorized) return null
  return <EditorialEditor key={`${user.login}:${date}`} date={date} articleTitle={articleTitle} login={user.login} visibleBlobSha={visibleBlobSha} actionChoicesReady={actionChoicesReady} />
}
