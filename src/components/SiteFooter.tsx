import { Link } from 'react-router-dom'

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-border px-4 py-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-3 text-center text-xs text-ink-muted">
        <nav className="flex items-center gap-4" aria-label="页脚导航">
          <Link to="/gallery" className="hover:text-ink">
            美图
          </Link>
          <Link to="/keycaps" className="hover:text-ink">
            键帽
          </Link>
        </nav>
        <p>本站为爱好者非营利资料站，图片版权归原作者所有，侵删。</p>
      </div>
    </footer>
  )
}
