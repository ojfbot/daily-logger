import { useAppSelector } from '../store/hooks.ts'

export function AuthButton() {
  const { user, checked } = useAppSelector((s) => s.auth)

  // Don't render anything until we've checked auth status (prevents flash)
  if (!checked) return null

  if (!user) {
    return (
      <a href="/api/auth/login" className="auth-login-btn">
        Sign in
      </a>
    )
  }

  return (
    <div className="auth-user">
      <img
        src={user.avatarUrl}
        alt={user.login}
        className="auth-avatar"
        width={20}
        height={20}
      />
      <span className="auth-username">{user.login}</span>
      <a href="/api/auth/logout" className="auth-logout-link">
        Sign out
      </a>
    </div>
  )
}
