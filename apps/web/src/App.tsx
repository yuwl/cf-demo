import { AuthProvider, useAuth } from './auth'
import BoardPage from './pages/Board'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import VerifyEmailPage from './pages/VerifyEmail'
import { useRoute } from './router'

function Routes() {
  const { path, navigate } = useRoute()
  const { loading } = useAuth()

  if (loading) {
    return <div className="boot">正在加载…</div>
  }

  switch (path) {
    case '/login':
      return <LoginPage navigate={navigate} />
    case '/register':
      return <RegisterPage navigate={navigate} />
    case '/verify-email':
      return <VerifyEmailPage navigate={navigate} />
    default:
      return <BoardPage navigate={navigate} />
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Routes />
    </AuthProvider>
  )
}
