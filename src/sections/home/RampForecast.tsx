import { useEffect, useMemo, useState } from 'react'
import {
  ComposedChart, Area, Bar, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceArea, ResponsiveContainer, Cell, Legend,
} from 'recharts'
import { Zap, Globe, GitCompare, AlertTriangle, ChevronDown } from 'lucide-react'
import { loadRampSeries, loadCrossRegion, loadModelCompare } from '@/lib/data-service'
import type { RampSeriesFile, CrossRegionFile, ModelCompareFile } from '@/types/adjust'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// 深色主题统一色板（与 TimeseriesFeatures 一致）
const C = {
  cyan: '#22d3ee',
  cyanSoft: 'hsl(187 90% 55%)',
  sky: '#38bdf8',
  amber: 'hsl(45 95% 60%)',
  violet: '#a78bfa',
  emerald: 'hsl(142 70% 55%)',
  rose: 'hsl(0 80% 62%)',
  white: 'hsl(210 40% 88%)',
  grid: 'hsl(217 33% 15%)',
  axis: 'hsl(215 20% 58%)',
  tooltipBg: 'hsl(222 44% 10%)',
  tooltipBd: 'hsl(217 33% 20%)',
}
const TIP = { contentStyle: { background: C.tooltipBg, border: `1px solid ${C.tooltipBd}`, borderRadius: 8, fontSize: 12 } }
const axisTick = { fontSize: 10, fill: C.axis }
const axisLine = { stroke: 'hsl(217 33% 18%)' }

export type RampRegion = 'nl' | 'be'

const REGION_LABEL: Record<RampRegion, { name: string; peak: string; note: string }> = {
  nl: { name: '荷兰 NL', peak: '≈18.9 GW', note: 'DE 训练模型 · 零样本预警' },
  be: { name: '比利时 BE', peak: '≈13.8 GW', note: 'DE 训练模型 · 零样本预警（无新能源，特征受限）' },
}

export default function RampForecast() {
  const [open, setOpen] = useState(true)
  const [region, setRegion] = useState<RampRegion>('nl')
  const [date, setDate] = useState<string | null>(null)
  const [ramp, setRamp] = useState<RampSeriesFile | null>(null)
  const [cross, setCross] = useState<CrossRegionFile | null>(null)
  const [compare, setCompare] = useState<ModelCompareFile | null>(null)

  // 装载本轮区域爬坡序列 + 跨区域/多模型指标
  useEffect(() => {
    let alive = true
    Promise.all([loadRampSeries(region), loadCrossRegion(), loadModelCompare()])
      .then(([r, c, m]) => { if (alive) { setRamp(r); setCross(c); setCompare(m) } })
      .catch(() => { if (alive) setRamp(null) })
    return () => { alive = false }
  }, [region])

  // 默认选中「真实爬坡事件最多」的一天（最具代表性）
  const dateKeys = useMemo(() => (ramp ? Object.keys(ramp.days) : []), [ramp])
  const bestDay = useMemo(() => {
    if (!ramp || !dateKeys.length) return null
    let best: string | null = null
    let bestCnt = -1
    for (const k of dateKeys) {
      const d = ramp.days[k]
      const cnt = d.label.reduce((s, v) => s + (v === 1 ? 1 : 0), 0)
      if (cnt > bestCnt) { bestCnt = cnt; best = k }
    }
    return best
  }, [ramp, dateKeys])

  useEffect(() => { if (bestDay && !date) setDate(bestDay) }, [bestDay, date])
  useEffect(() => { if (region) setDate(null) }, [region])

  // 时序行（zip 96 点）
  const rows = useMemo(() => {
    if (!ramp || !date || !ramp.days[date]) return []
    const d = ramp.days[date]
    return d.t.map((tt, i) => ({
      i,
      t: tt.slice(11, 16), // HH:mm
      tFull: tt,
      load: d.load?.[i] ?? null,
      dp: d.dP_mw?.[i],
      prob: d.prob?.[i],
      event: d.label?.[i] === 1,
      up: d.label?.[i] === 1 && (d.dP_mw?.[i] ?? 0) > 0 ? (d.load?.[i] ?? null) : null,
      down: d.label?.[i] === 1 && (d.dP_mw?.[i] ?? 0) < 0 ? (d.load?.[i] ?? null) : null,
    }))
  }, [ramp, date])

  // 预警窗口：连续 prob≥0.5 的时段（ReferenceArea 背景高亮）
  const warnIntervals = useMemo(() => {
    if (!rows.length) return []
    const out: { x1: number; x2: number }[] = []
    let start = -1
    for (let i = 0; i < rows.length; i++) {
      const warn = (rows[i].prob ?? 0) >= 0.5
      if (warn && start < 0) start = i
      if ((!warn || i === rows.length - 1) && start >= 0) {
        out.push({ x1: start, x2: warn ? i : i - 1 })
        start = -1
      }
    }
    return out
  }, [rows])

  // KPI
  const kpi = useMemo(() => {
    if (!rows.length) return null
    const events = rows.filter((r) => r.event).length
    const warns = rows.filter((r) => (r.prob ?? 0) >= 0.5)
    const hit = warns.filter((r) => r.event).length
    const maxProb = Math.max(...rows.map((r) => r.prob ?? 0))
    return { events, warns: warns.length, hit, maxProb }
  }, [rows])

  // 跨区域泛化 AUC 对比
  const rampAuc = useMemo(() => {
    if (!cross) return []
    const norm = cross.experiments_scale_normalized ?? {}
    const exp = cross.experiments ?? {}
    const row = (name: string, auc: number | undefined, kind: string) =>
      ({ name, auc: auc != null ? Number(auc.toFixed(3)) : null, kind })
    const rows: { name: string; auc: number | null; kind: string }[] = [
      row('DE 自训练', norm.DE_self?.auc, 'self'),
      row('NL 自训练', norm.NL_self?.auc, 'self'),
      row('NL→DE 零样本·标幺', norm.NL_DE?.auc, 'zs'),
      row('DE→NL 零样本·标幺', norm.DE_NL?.auc, 'zs'),
      row('NL→BE 零样本', exp.ZS_NL_BE?.metrics?.auc, 'zs'),
      row('DE→NL 原始 MW（对照）', exp.ZS_DE_NL?.metrics?.auc, 'raw'),
    ]
    return rows.filter((r) => r.auc != null)
  }, [cross])

  // LGB / Transformer 多模型对比（同口径）
  const compareRows = useMemo(() => {
    if (!compare?.any) return []
    const l = compare.any.lightgbm as { auc?: number; pr_auc?: number; brier?: number; f1_at_best?: number }
    const t = compare.any.transformer as { auc?: number; pr_auc?: number; brier?: number; f1_at_best?: number }
    return [
      { name: 'AUC', lgb: l.auc, tf: t.auc, better: (l.auc ?? 0) >= (t.auc ?? 0), fmt: (v?: number) => v?.toFixed(4) },
      { name: 'PR-AUC', lgb: l.pr_auc, tf: t.pr_auc, better: (l.pr_auc ?? 0) >= (t.pr_auc ?? 0), fmt: (v?: number) => v?.toFixed(4) },
      { name: 'Brier', lgb: l.brier, tf: t.brier, better: (l.brier ?? 0) <= (t.brier ?? 0), fmt: (v?: number) => v?.toFixed(4), invert: true },
      { name: '最优 F1', lgb: l.f1_at_best, tf: t.f1_at_best, better: (l.f1_at_best ?? 0) >= (t.f1_at_best ?? 0), fmt: (v?: number) => v?.toFixed(4) },
    ]
  }, [compare])

  if (!ramp || !cross || !compare) return null

  const selDate = date ?? bestDay ?? dateKeys[0]
  const rl = REGION_LABEL[region]

  return (
    <div className="card-glow rounded-xl p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <span>负荷爬坡事件概率预警 · 跨电网零样本泛化</span>
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-400">创新点</Badge>
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              爬坡 = 未来 1h 内净负荷变化超过阈值（新能源高渗透下电网调度的关键风险）。模型在同一口径下于
              <b className="text-foreground/80">德 / 荷 / 比利时的不同规模电网间跨区域迁移</b>——用一个电网训练的模型在另一个电网零样本预警爬坡，按各区域峰值<b className="text-emerald-400">标幺化</b>后跨电网 AUC≈0.90。
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          {/* 区域 + 日期选择 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {(Object.keys(REGION_LABEL) as RampRegion[]).map((r) => (
                <button key={r} onClick={() => setRegion(r)}
                  className={cn(
                    'flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    region === r
                      ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                      : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
                  )}>
                  <Globe className="h-3 w-3" />{REGION_LABEL[r].name}
                </button>
              ))}
            </div>
            <select value={selDate} onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-[11px] text-foreground outline-none">
              {dateKeys.map((k) => (
                <option key={k} value={k}>2019-11 · {k.slice(8)}</option>
              ))}
            </select>
            <span className="text-[10px] text-muted-foreground">{rl.note}</span>
          </div>

          {/* KPI 三卡 */}
          {kpi && (
            <div className="grid grid-cols-3 gap-2">
              <MiniKpi label="本日峰值预测概率" value={`${(kpi.maxProb * 100).toFixed(0)}%`} icon={<Zap className="h-3 w-3 text-amber-400" />} />
              <MiniKpi label="真实爬坡事件" value={`${kpi.events}`} unit="个" icon={<AlertTriangle className="h-3 w-3 text-rose-400" />} />
              <MiniKpi label="预警时段命中率" value={`${kpi.warns ? Math.round((kpi.hit / kpi.warns) * 100) : 0}%`} sub={`预警 ${kpi.warns} 段 · 命中 ${kpi.hit}`} icon={<AlertTriangle className="h-3 w-3 text-emerald-400" />} />
            </div>
          )}

          {/* 主图：负荷 + 1h爬坡变化 + 真实事件 + 预警窗口 */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold">单日爬坡预警时序 · <span className="font-mono text-[11px] text-muted-foreground">{selDate}</span></h4>
              <div className="flex gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-rose-400" />上爬坡</span>
                <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-sky-400" />下爬坡</span>
                <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-amber-400/60" />预警窗口(≥0.5)</span>
              </div>
            </div>
            <div style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 10, bottom: 0, left: -6 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  {warnIntervals.map((w, i) => (
                    <ReferenceArea key={i} x1={w.x1} x2={w.x2} fill={C.amber} fillOpacity={0.08} ifOverflow="extendDomain" stroke="none" />
                  ))}
                  <XAxis dataKey="i" type="number" domain={[0, 95]} tick={axisTick} tickLine={false} axisLine={axisLine}
                    tickFormatter={(i: number) => (i % 16 === 0 ? rows[i]?.t ?? '' : '')} interval={0} />
                  <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={42} domain={['dataMin - 500', 'dataMax + 500']} />
                  <YAxis yAxisId="r" orientation="right" tick={axisTick} tickLine={false} axisLine={false}
                    tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={40} />
                  <Tooltip {...TIP} content={<RampTip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => { const m: Record<string, string> = { load: '实际负荷', dp: '1h 爬坡变化', up: '上爬坡', down: '下爬坡' }; return <span style={{ color: C.axis }}>{m[v] ?? v}</span> }} />
                  <Area yAxisId="l" dataKey="load" name="load" type="monotone" stroke={C.sky} strokeWidth={1.8} fill={C.sky} fillOpacity={0.12} dot={false} isAnimationActive={false} />
                  <Bar yAxisId="r" dataKey="dp" name="dp" barSize={5} isAnimationActive={false}>
                    {rows.map((r, i) => (
                      <Cell key={i} fill={(r.dp ?? 0) > 0 ? 'hsla(187 90% 55% / 0.55)' : 'hsla(45 95% 60% / 0.5)'} />
                    ))}
                  </Bar>
                  <Scatter yAxisId="l" dataKey="up" name="up" fill={C.rose} shape="triangle" />
                  <Scatter yAxisId="l" dataKey="down" name="down" fill={C.sky} shape="triangle" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 下半：跨区域泛化 + 多模型对比 */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-border/60 bg-card/30 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-emerald-400" />
                <h4 className="text-[12px] font-semibold">跨电网零样本泛化 AUC</h4>
              </div>
              <div style={{ height: 210 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={rampAuc} layout="vertical" margin={{ top: 4, right: 30, bottom: 0, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                    <XAxis type="number" domain={[0, 1]} tick={axisTick} tickLine={false} axisLine={false} />
                    <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={false} />
                    <Tooltip {...TIP} formatter={(v: number) => [`${v?.toFixed(3)}`, 'AUC']} />
                    <Bar dataKey="auc" barSize={14} radius={[3, 3, 3, 3]}>
                      {rampAuc.map((r, i) => (
                        <Cell key={i} fill={r.kind === 'self' ? C.emerald : r.kind === 'zs' ? C.cyan : 'hsla(0 60% 55% / 0.7)'} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
                同一对电网（DE→NL）<b className="text-rose-300">原始 MW 特征 AUC 0.62 逼近随机</b>，按各区域峰值<b className="text-emerald-300">标幺化后升至 0.90</b>——印证「爬坡是峰值的比例事件、其规律是尺度不变的」。NL→BE 因比利时无新能源（特征集收窄）泛化略降，属预期。
              </p>
            </div>

            <div className="rounded-xl border border-border/60 bg-card/30 p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <GitCompare className="h-3.5 w-3.5 text-violet-400" />
                <h4 className="text-[12px] font-semibold">多模型同口径对比 · LGB vs Transformer</h4>
              </div>
              <div className="space-y-1.5">
                {compareRows.map((r) => (
                  <div key={r.name} className="flex items-center gap-2 rounded-md border border-border/50 bg-secondary/20 px-2 py-1.5">
                    <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">{r.name}</span>
                    <span className={cn('w-28 flex-1 rounded-md px-2 py-1 text-center text-[11px] font-semibold', r.better ? 'bg-cyan-500/15 text-cyan-300' : 'bg-transparent text-muted-foreground')}>
                      LGB <b>{r.fmt(r.lgb)}</b>
                    </span>
                    <span className={cn('w-6 text-center text-[10px] text-muted-foreground/60', !r.better ? 'opacity-100' : 'opacity-40')}>
                      {r.better ? '↑ 优' : '↓ 劣'}
                    </span>
                    <span className={cn('w-28 flex-1 rounded-md px-2 py-1 text-center text-[11px] font-semibold', !r.better ? 'bg-violet-500/15 text-violet-300' : 'bg-transparent text-muted-foreground')}>
                      TRF <b>{r.fmt(r.tf)}</b>
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                <b className="text-cyan-300">LightGBM 全方位占优</b>（树模型已基本榨干特征时序信息）。Transformers 作为序列建模尝试留档；前端主线沿用 LGB。数据集：OPSD 德/荷/比利时 2018-2019 + Open-Meteo 气象，窗口 1h、爬坡占比约 22%。
              </p>
            </div>
          </div>

          {/* 底部口径 */}
          <p className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
            口径：爬坡 = |P(t+1h)−P(t)| ≥ 各区域观测峰值 3.88%；特征 48 维多因素（负荷滞后/滚动/波动 + 气象 + 新能源出力）；模型 LightGBM（DE 训练 → 对 NL / BE 零样本）；时段 2019-11-04 ~ 11-24（21 天 · 15min · 96 点/天）。来源：OPSD 欧洲负荷序列 + Open-Meteo 历史气象。
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** 时序 tooltip：负荷 / 1h 爬坡变化 / 预测概率 / 是否真实事件 */
function RampTip({ active, payload, label: _label }: any) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  const dp = row.dp
  const direction = dp == null ? '—' : dp > 0 ? `▲ 上爬坡 +${Math.round(dp)} MW` : dp < 0 ? `▼ 下爬坡 ${Math.round(dp)} MW` : '→ 平稳'
  return (
    <div style={{ ...TIP.contentStyle, color: C.axis }}>
      <div style={{ fontWeight: 600, color: C.white, marginBottom: 3 }}>{row.t}（{row.i} / 95）</div>
      <div style={{ color: C.sky }}>实际负荷：{row.load != null ? `${Math.round(row.load).toLocaleString()} MW` : '—'}</div>
      <div style={{ color: C.amber }}>1h 爬坡变化：{direction}</div>
      <div style={{ color: C.cyanSoft }}>预测爬坡概率：{(row.prob * 100).toFixed(1)}%</div>
      <div style={{ color: row.event ? C.rose : C.axis }}>{row.event ? '✓ 真实爬坡事件' : '（未发生爬坡）'}</div>
    </div>
  )
}

function MiniKpi({ label, value, unit, sub, icon }: {
  label: string; value: string; unit?: string; sub?: string; icon?: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        <span>{label}</span>
        {sub && <span className="ml-auto text-[9px] text-muted-foreground/70">{sub}</span>}
      </div>
      <div className="mt-0.5 font-mono text-[15px] font-semibold text-foreground">
        {value}{unit && <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </div>
    </div>
  )
}
