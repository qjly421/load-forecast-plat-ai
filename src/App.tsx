import { useState } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router'
import { Zap, LayoutDashboard, SlidersHorizontal, TrendingUp, Sparkles, ChevronDown, Globe, Layers, Share2 } from 'lucide-react'
import Home from './pages/Home'
import Adjust from './pages/Adjust'
import Ramp from './pages/Ramp'
import { cn } from '@/lib/utils'

/** 平台三大创新（正式措辞，指标与全系统一致） */
const INNOVATIONS = [
  { icon: Globe, title: '跨电网零样本迁移', desc: '将爬坡定义为区域峰值的一定比例并作标幺化归一，使规律在不同规模电网间保持一致。以欧洲某电网训练所得模型，免重训即可零样本迁移至中国山东电网；自训练 AUC 0.95~0.98，跨电网零样本 0.71~0.95。' },
  { icon: Layers, title: '多模型互为校核', desc: '内置 LightGBM / TCN / Transformer 等多种模型，统一口径公平对比、择优输出，避免对单一模型的认知偏置。' },
  { icon: Share2, title: '人机协同研判闭环', desc: '构建「预测—预警—修正—复核」闭环：AI 给出预测底稿与风险预警，调度经验经相似日/分时段介入修正，系统即时复核指标并给出风险提示与一键恢复。' },
]

function TopNav() {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const tabs = [
    { to: '/', label: '预测看板', icon: LayoutDashboard },
    { to: '/adjust', label: '手动调整', icon: SlidersHorizontal },
    { to: '/ramp', label: '爬坡预警', icon: TrendingUp },
  ]
  return (
    <nav className="sticky top-0 z-[60] border-b border-border/80 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-11 max-w-[1700px] items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/15 ring-1 ring-primary/40">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-[13px] font-semibold tracking-tight">驭电智判 · 负荷预测与人机协同风险研判平台</span>
          {/* 平台创新徽标：点击下拉展示三大创新 */}
          <div className="relative">
            <button
              onClick={() => setOpen((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all',
                'border-amber-400/40 bg-gradient-to-r from-amber-400/15 to-emerald-400/10 text-amber-300',
                'hover:border-amber-300/60 hover:text-amber-200',
                open && 'border-amber-300/70 text-amber-200',
              )}
            >
              <Sparkles className="h-3 w-3" />
              平台创新
              <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-[69]" onClick={() => setOpen(false)} />
                <div className="absolute left-0 top-full z-[70] mt-2 w-[380px] rounded-xl border border-amber-400/30 bg-[hsl(222,46%,8%)] p-3 shadow-2xl shadow-black/60">
                  <div className="mb-2 flex items-center gap-1.5 px-0.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                    <span className="text-[11px] font-bold text-amber-200">平台三大创新</span>
                    <span className="ml-auto text-[9px] text-muted-foreground">驭电智判 · 特征亮点</span>
                  </div>
                  <div className="space-y-2">
                    {INNOVATIONS.map((it, i) => (
                      <div key={it.title} className="flex gap-2.5 rounded-lg border border-border/60 bg-secondary/20 p-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-400/10 ring-1 ring-amber-400/30">
                          <it.icon className="h-3.5 w-3.5 text-amber-300" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-foreground">
                            <span className="mr-1 text-amber-300/70">{i + 1}.</span>
                            {it.title}
                          </div>
                          <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{it.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
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
        <Route path="/ramp" element={<Ramp />} />
      </Routes>
    </>
  )
}
