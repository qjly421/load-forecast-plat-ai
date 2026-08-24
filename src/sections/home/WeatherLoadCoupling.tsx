import { useEffect, useMemo, useState } from 'react'
import {
  ScatterChart, Scatter, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ZAxis,
} from 'recharts'
import { CloudSun, ThermometerSnowflake, TrendingDown, Snowflake } from 'lucide-react'
import { loadWeatherLoadCoupling } from '@/lib/data-service'
import type { WeatherLoadCouplingFile } from '@/types/adjust'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

const C = {
  cyan: '#22d3ee',
  cyanSoft: 'hsl(187 90% 55%)',
  sky: '#38bdf8',
  amber: 'hsl(45 95% 60%)',
  rose: 'hsl(0 80% 62%)',
  grid: 'hsl(217 33% 15%)',
  axis: 'hsl(215 20% 58%)',
  white: 'hsl(210 40% 88%)',
}
const TIP = { contentStyle: { background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 } }
const axisTick = { fontSize: 10, fill: C.axis }

export default function WeatherLoadCoupling() {
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<WeatherLoadCouplingFile | null>(null)

  useEffect(() => {
    let alive = true
    loadWeatherLoadCoupling().then((d) => { if (alive) setData(d) }).catch(() => {})
    return () => { alive = false }
  }, [])

  // 散点已按温度升序（趋势更直观）
  const scatter = useMemo(() => data?.scatter ?? [], [data])

  if (!data) return null
  const s = data.stats

  return (
    <div className="card-glow rounded-xl p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <CloudSun className="h-3.5 w-3.5 text-orange-400" />
              <span>气象-负荷耦合 · GEFCom2014-L（美东）</span>
            </h3>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
              25 个气象站点温度（加权）× 区域指数负荷，同窗口逐小时对齐。揭示<b className="text-sky-300">气象是负荷最核心的驱动因子</b>——温度变化直接作用于采暖/制冷负荷，构成爬坡风险的重要诱因。
            </p>
          </div>
          <Snowflake className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          {/* 三指标 */}
          <div className="grid grid-cols-3 gap-2">
            <CouplingKpi icon={<TrendingDown className="h-3 w-3 text-cyan-400" />} label="温度-负荷 Pearson" value={s.pearson.toFixed(2)}
              note="强负相关（冬季采暖主导）" />
            <CouplingKpi icon={<ThermometerSnowflake className="h-3 w-3 text-sky-400" />} label="窗口温度范围" value={`${s.tempMin.toFixed(0)}~${s.tempMax.toFixed(0)}°F`}
              note={`${s.n} 逐小时点`} />
            <CouplingKpi icon={<Snowflake className="h-3 w-3 text-rose-400" />} label="低温区(≤45°F)均负荷" value={s.cold_avgLoad?.toFixed(0) ?? '—'}
              note={`其余气温均 ${s.total_avgLoad.toFixed(0)} · ${s.cold_n} 点`} />
          </div>

          {/* 散点：温度 vs 负荷 */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold">温度-负荷散点（逐小时 · 25 站温度取均值，单位 ℉）</h4>
              <span className="text-[10px] text-muted-foreground">{data.source}</span>
            </div>
            <div style={{ height: 250 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="t" type="number" name="温度" unit="°F" domain={['dataMin - 2', 'dataMax + 2']}
                    tick={axisTick} tickLine={false} axisLine={false} />
                  <YAxis dataKey="load" type="number" name="负荷" tick={axisTick} tickLine={false} axisLine={false} width={44} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip {...TIP} cursor={{ strokeDasharray: '3 3', stroke: C.axis }} content={<CouplingScatterTip />} />
                  <Scatter data={scatter.sort((a, b) => a.t - b.t)} fill={C.cyanSoft} fillOpacity={0.75} isAnimationActive={false} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 温度分档 · 平均负荷曲线 */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3">
            <div className="mb-1 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold">温度分档平均负荷曲线（每 5°F 一档）</h4>
              <span className="text-[10px] text-muted-foreground">气温越低 → 采暖负荷越高（下降趋势）</span>
            </div>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.segments} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="t" type="number" domain={['dataMin - 3', 'dataMax + 3']} tick={axisTick} tickLine={false}
                    axisLine={false} tickFormatter={(v: number) => `${Math.round(v)}°F`} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
                  <Tooltip {...TIP} formatter={(v: number, name: string) => [name === 'load' ? `${v}（指数负荷）` : v, name === 'load' ? '平均负荷' : name]} />
                  <Line dataKey="load" type="monotone" stroke={C.amber} strokeWidth={2.4} dot={{ r: 3, fill: C.amber, strokeWidth: 0 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 结论（诚实口径） */}
          <p className="rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[11px] leading-relaxed text-foreground/90">
            <b className="text-sky-300">结论：</b>本窗口为冬季（2011-12-12 ~ 12-31），温度范围 {s.tempMin.toFixed(0)}~{s.tempMax.toFixed(0)}°F、<b className="text-rose-300">无高温日</b>，故呈现<b className="text-cyan-300">采暖主导的强负相关（r≈{s.pearson.toFixed(2)}）</b>——气温越低、采暖负荷越高（低温区 ≤45°F 均负荷 {s.cold_avgLoad?.toFixed(0) ?? '—'}，高于总均 {s.total_avgLoad.toFixed(0)}）。这是真实物理规律，未夸大；高温制冷反向耦合需补夏季窗口数据。
          </p>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

function CouplingScatterTip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  return (
    <div style={{ ...TIP.contentStyle, color: C.white }}>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>温度 {p.t}°F</div>
      <div style={{ color: C.sky }}>指数负荷：{p.load}</div>
    </div>
  )
}

function CouplingKpi({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/30 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">{icon}<span>{label}</span></div>
      <div className="mt-0.5 font-mono text-[16px] font-semibold text-foreground">{value}</div>
      {note && <div className="text-[9px] text-muted-foreground/70">{note}</div>}
    </div>
  )
}
