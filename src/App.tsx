import { Routes, Route, Link, useLocation } from 'react-router'
import { Zap, LayoutDashboard, SlidersHorizontal } from 'lucide-react'
import Home from './pages/Home'
import Adjust from './pages/Adjust'
import { cn } from '@/lib/utils'

function TopNav() {
  const { pathname } = useLocation()
  const tabs = [
    { to: '/', label: '预测看板', icon: LayoutDashboard },
    { to: '/adjust', label: '手动调整', icon: SlidersHorizontal },
  ]
  return (
    <nav className="sticky top-0 z-[60] border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-11 max-w-[1700px] items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">山东负荷预测平台</span>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors',
                pathname === t.to
                  ? 'bg-primary/15 font-semibold text-primary'
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
              )}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default function App() {
  return (
    <>
      <TopNav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/adjust" element={<Adjust />} />
      </Routes>
    </>
  )
}
