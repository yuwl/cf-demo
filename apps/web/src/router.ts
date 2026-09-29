import { useCallback, useEffect, useState } from 'react'

/**
 * 极简前端路由。demo 只有 4 个页面，没必要为它引入 react-router。
 * 依赖 apps/web/public/_redirects 提供的 SPA 回退，刷新深链接不会 404。
 */
export function useRoute(): { path: string; navigate: (next: string) => void } {
  const [path, setPath] = useState<string>(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((next: string) => {
    window.history.pushState({}, '', next)
    // 只把 pathname 作为路由键。
    // next 可能带 query（例如 /verify-email?token=xxx），若把整串塞进 path，
    // App 里的 switch 就匹配不到对应页面，会静默落到 default 分支。
    // query 交给页面自己读 window.location.search。
    setPath(window.location.pathname)
    window.scrollTo({ top: 0 })
  }, [])

  return { path, navigate }
}
