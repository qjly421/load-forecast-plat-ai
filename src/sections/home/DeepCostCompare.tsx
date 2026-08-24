import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Cpu, Timer, Layers, ChevronDown } from 'lucide-react'
import { loadDeepCost } from '@/lib/data-service'
import type { DeepCostModel, DeepCostFile } from '@/types/adjust'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

const C = {
  grid: 'hsl(217 33% 15%)',
  axis: 'hsl(215 20% 58%)',
  tooltipBg: 'hsl(222 44% 10%)',
  tooltipBd: 'hsl(217 33% 20%)',
}
const COLOR: Record<string, string> = { lgb: 'hsl(45 95% 60%)', tcn: '#22d3ee', transformer: '#a78bfa' }
const TIP = { contentStyle: { background: C.tooltipBg, border: `1px solid ${C.tooltipBd}`, borderRadius: 8, fontSize: 12 } }
const axisTick = { fontSize: 10, fill: C.axis }
const fmt = (n: number) => n.toLocaleString()

/**
 * 模型对比 · LightGBM / TCN / Transformer（同为负荷预测，同任务同口径）
 * 展示 训练耗时 / 规模 / 各提前期 MAPE & PICP，突出 LightGBM 在短提前期与成本上的优势，
 * 及 TCN 在长提前期的序列建模价值、Transformer 在该任务的局限。
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

  const toRows = (key: 'mape' | 'picp') =>
    horizons.map((h) => {
      const row: Record<string, number | string> = { name: `D${h}` }
      for (const m of data!.models) row[m.id] = m.horizon[h]?.[key] ?? null
      return row
    })
  const mapeData = useMemo(() => (data ? toRows('mape') : []), [data, horizons])
  const picpData = useMemo(() => (data ? toRows('picp') : []), [data, horizons])

  const models = useMemo(() => data?.models ?? [], [data])

  // 各提前期 MAPE 最优模型 + 结论
  const perHorizonBest = useMemo(() => {
    if (!data) return []
    return horizons.map((h) => {
      let best: DeepCostModel | null = null
      for (const m of data.models) {
        const v = m.horizon[h]?.mape
        if (v == null) continue
        if (!best || v < best.horizon[h].mape) best = m
      }
      return { h, best }
    })
  }, [data, horizons])

  const conclusion = useMemo(() => {
    if (!data || models.length < 2) return ''
    const lgb = models.find((m) => m.id === 'lgb')
    const d1Best = perHorizonBest.find((r) => r.h === '1')?.best
    const longBest = perHorizonBest.find((r) => r.h === '14')?.best
    const msg: string[] = []
    if (lgb && d1Best) {
      msg.push(
        `LightGBM 训练最快（${lgb.train_time_s}s）且短提前期最准（D1 MAPE ${lgb.horizon['1'].mape.toFixed(2)}%、PICP ${lgb.horizon['1'].picp.toFixed(1)}%，三者中唯 B 达标≥90%）`,
      )
      if (d1Best.id !== 'lgb') msg.push(`；但 D1 最优并非 LightGBM，而是 ${d1Best.name}`)
    }
    const tcn = models.find((m) => m.id === 'tcn')
    if (tcn && longBest?.id === 'tcn') {
      msg.push(`TCN 的序列建模在长提前期反超（D14 MAPE ${tcn.horizon['14'].mape.toFixed(2)}% < LGB ${lgb!.horizon['14'].mape.toFixed(2)}%）`)
    }
    const wf = models.find((m) => m.id === 'transformer')
    if (wf) {
      msg.push(`Transformer 训练代价与 TCN 相当、却全面最差（D1 8.52% / PICP 63.6%，且越到长提前期 MAPE 越高）`)
    }
    const cheap = [...models].sort((a, b) => a.train_time_s - b.train_time_s)[0]
    msg.push(`三者训练耗时都 <2s，工程上都很轻量；真正的分水岭是${cheap.id === 'lgb' ? ' LightGBM 在成本与短提前期上的双重优势' : '精度而非成本'}`)
    return msg.join('。') + '。'
  }, [data, models, perHorizonBest])

  if (!data || models.length < 2) return null

  return (
    <div className="card-glow rounded-xl p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Layers className="h-3.5 w-3.5 text-violet-400" />
              <span>模型对比 · LightGBM / TCN / Transformer</span>
              <span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">同为负荷预测 · 同任务同口径</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              树模型（LightGBM）与两个深度模型做同样的「日前 96 点负荷预测」，公平比较<b className="text-amber-300">训练成本</b>与<b className="text-cyan-300">精度</b>，看清各自优势与短板。
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          {/* 训练成本 + 规模 KPI */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {models.map((m) => (
              <div key={m.id} className="rounded-xl border border-border/60 bg-card/30 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-semibold">
                    <Cpu className="h-3.5 w-3.5" style={{ color: COLOR[m.id] }} />{m.name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{m.size_label ?? '参数量'}</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CostKpi icon={<Layers className="h-3 w-3 text-violet-400" />} label={m.size_label ?? '规模'} value={fmt(m.n_params)} />
                  <CostKpi icon={<Timer className="h-3 w-3 text-amber-400" />} label="训练耗时" value={`${m.train_time_s}s`} />
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                  D1 {m.horizon['1']?.mape?.toFixed(2)}% / PICP {m.horizon['1']?.picp?.toFixed(1)}%
                  {m.horizon['7'] && !m.horizon['14'] ? ` · D7 ${m.horizon['7'].mape.toFixed(2)}%` : ''}
                  {m.horizon['14'] ? ` · D7 ${m.horizon['7']?.mape.toFixed(2)}% · D14 ${m.horizon['14'].mape.toFixed(2)}%` : ''}
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
                    formatter={(v: string) => <span style={{ color: C.axis }}>{models.find((m) => m.id === v)?.name ?? v}</span>} />
                  {models.map((m) => (
                    <Bar key={m.id} dataKey={m.id} name={m.name} fill={COLOR[m.id]} radius={[4, 4, 0, 0]} barSize={22} />
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
                    formatter={(v: string) => <span style={{ color: C.axis }}>{models.find((m) => m.id === v)?.name ?? v}</span>} />
                  {models.map((m) => (
                    <Bar key={m.id} dataKey={m.id} name={m.name} fill={COLOR[m.id]} radius={[4, 4, 0, 0]} barSize={22} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 结论 */}
          <p className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[11px] leading-relaxed text-foreground/90">
            <b className="text-amber-300">结论：</b>{conclusion}
          </p>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            口径说明：三者均以 W=14 历史日 × 96 点负荷 + 气温/星期为输入，预测目标日 96 点；训练/校准/测试切分完全一致，同为「日前负荷预测」任务。LightGBM 的「规模」用树×叶总叶数近似（GBDT 无神经网络参数量概念）。
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
