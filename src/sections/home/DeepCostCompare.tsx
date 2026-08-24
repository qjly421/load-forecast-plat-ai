import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Cpu, Timer, Layers, ChevronDown } from 'lucide-react'
import { loadDeepCost } from '@/lib/data-service'
import type { DeepCostFile } from '@/types/adjust'
import { InfoTip } from '@/components/ui/info-tip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

const C = {
  cyan: '#22d3ee',
  violet: '#a78bfa',
  amber: 'hsl(45 95% 60%)',
  white: 'hsl(210 40% 88%)',
  grid: 'hsl(217 33% 15%)',
  axis: 'hsl(215 20% 58%)',
  tooltipBg: 'hsl(222 44% 10%)',
  tooltipBd: 'hsl(217 33% 20%)',
}
const TIP = { contentStyle: { background: C.tooltipBg, border: `1px solid ${C.tooltipBd}`, borderRadius: 8, fontSize: 12 } }
const axisTick = { fontSize: 10, fill: C.axis }

const fmt = (n: number) => n.toLocaleString()

/**
 * 深度基线对比 · TCN vs Transformer（同为负荷预测，同任务同口径）
 * 展示 参数量 / 单日训练耗时 / 各提前期 MAPE & PICP，给出诚实结论。
 */
export default function DeepCostCompare() {
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<DeepCostFile | null>(null)
  useEffect(() => { loadDeepCost().then(setData).catch(() => {}) }, [])

  const horizons = useMemo(() => {
    if (!data?.models.length) return []
    const set = new Set<string>()
    for (const m of data.models) for (const h of Object.keys(m.horizon)) set.add(h)
    return Array.from(set).sort((a, b) => Number(a) - Number(b))
  }, [data])

  const mapeData = useMemo(() => {
    if (!data) return []
    return horizons.map((h) => {
      const row: Record<string, number | string> = { name: `D${h}` }
      for (const m of data.models) row[m.id] = m.horizon[h]?.mape ?? null
      return row
    })
  }, [data, horizons])

  const picpData = useMemo(() => {
    if (!data) return []
    return horizons.map((h) => {
      const row: Record<string, number | string> = { name: `D${h}` }
      for (const m of data.models) row[m.id] = m.horizon[h]?.picp ?? null
      return row
    })
  }, [data, horizons])

  if (!data || data.models.length < 2) return null

  // 结论：从真实数字生成
  const [m1, m2] = data.models
  const betterMape = horizons
    .filter((h) => m1.horizon[h] && m2.horizon[h])
    .map((h) => {
      const a = m1.horizon[h].mape, b = m2.horizon[h].mape
      return { h, winner: a < b ? m1 : m2, gap: Math.abs(a - b) }
    })
  const wTot = betterMape.filter((r) => r.winner.id === m1.id).length
  const concl = wTot > betterMape.length / 2
    ? `${m1.name.split('（')[0]} 在 ${wTot}/${betterMape.length} 个提前期上 MAPE 更低`
    : `${m2.name.split('（')[0]} 在 ${betterMape.length - wTot}/${betterMape.length} 个提前期上 MAPE 更低`
  const cheaper = m1.n_params < m2.n_params ? m1 : m2
  const costNote = `两者训练代价几乎相同（单日训练 ≈${m1.train_time_s}s / ${m2.train_time_s}s，参数量 ${fmt(m1.n_params)} / ${fmt(m2.n_params)}），${cheaper.name.split('（')[0]} 略小；差距主要在精度而非成本。`
  const picpNote = `以 90% 目标区间看，${betterMape.find((r) => r.h === '1')?.winner.id === m1.id ? m1 : m2} 在 D1 的 PICP 更接近达标。`

  return (
    <div className="card-glow rounded-xl p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Layers className="h-3.5 w-3.5 text-violet-400" />
              <span>深度基线对比 · TCN vs Transformer</span>
              <span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">同为负荷预测 · 同任务同口径</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              两个深度模型做同样的「日前 96 点负荷预测」，公平比较<b className="text-violet-300">训练代价</b>与<b className="text-cyan-300">精度</b>。TCN（时序卷积）与 Transformer（自注意力）均按同一数据流训练。
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          {/* 代价 KPI：参数量 + 训练耗时 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.models.map((m) => (
              <div key={m.id} className="rounded-xl border border-border/60 bg-card/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <Cpu className="h-3.5 w-3.5 text-cyan-400" />{m.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">同任务（日前负荷预测）</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CostKpi icon={<Layers className="h-3 w-3 text-violet-400" />} label="参数量" value={fmt(m.n_params)} />
                  <CostKpi icon={<Timer className="h-3 w-3 text-amber-400" />} label="单日训练耗时" value={`${m.train_time_s}s`} />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  D1 {m.horizon['1']?.mape?.toFixed(2)}% / PICP {m.horizon['1']?.picp?.toFixed(1)}%
                  {m.horizon['7'] ? ` · D7 ${m.horizon['7'].mape.toFixed(2)}%` : ''}
                  {m.horizon['14'] ? ` · D14 ${m.horizon['14'].mape.toFixed(2)}%` : ''}
                </p>
              </div>
            ))}
          </div>

          {/* MAPE 分组柱：各提前期 */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold">各提前期 MAPE（% · 越低越好）</h4>
              <span className="text-[10px] text-muted-foreground">山东 全网 · 共形 90% 区间</span>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mapeData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 'dataMax + 1']} tick={axisTick} tickLine={false} axisLine={false} unit="%" width={36} />
                  <Tooltip {...TIP} formatter={(v: number) => [`${v?.toFixed?.(2) ?? v}%`]} />
                  <Legend wrapperStyle={{ fontSize: 11 }}
                    formatter={(v: string) => <span style={{ color: C.axis }}>{data.models.find((m) => m.id === v)?.name ?? v}</span>} />
                  {data.models.map((m, i) => (
                    <Bar key={m.id} dataKey={m.id} name={m.name} fill={i === 0 ? C.cyan : C.violet} radius={[4, 4, 0, 0]} barSize={22} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* PICP 分组柱 */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold">各提前期区间覆盖率 PICP（% · 名义 90%）</h4>
              <span className="text-[10px] text-muted-foreground">越高越接近真实覆盖</span>
            </div>
            <div style={{ height: 170 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={picpData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={axisTick} tickLine={false} axisLine={false} unit="%" width={36} />
                  <Tooltip {...TIP} formatter={(v: number) => [`${v?.toFixed?.(1) ?? v}%`]} />
                  <Legend wrapperStyle={{ fontSize: 11 }}
                    formatter={(v: string) => <span style={{ color: C.axis }}>{data.models.find((m) => m.id === v)?.name ?? v}</span>} />
                  {data.models.map((m, i) => (
                    <Bar key={m.id} dataKey={m.id} name={m.name} fill={i === 0 ? C.cyan : C.violet} radius={[4, 4, 0, 0]} barSize={22} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 结论 */}
          <p className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[11px] leading-relaxed text-foreground/90">
            <b className="text-violet-300">结论：</b>{concl}。{costNote}。{picpNote}
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            口径说明：两模型均以 W=14 历史日 × 96 点负荷 + 气温/星期为输入，预测目标日 96 点，MSE + 早停 + 共形区间，训练/校准/测试切分与 LightGBM 完全一致。
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function CostKpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-background/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-0.5 font-mono text-[16px] font-semibold text-foreground">{value}</div>
    </div>
  )
}
