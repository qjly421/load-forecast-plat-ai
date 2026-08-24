import { useEffect, useMemo, useState } from 'react'
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Waves, Sun, Wind, ChevronDown } from 'lucide-react'
import { loadNetLoad } from '@/lib/data-service'
import type { NetLoadFile } from '@/types/adjust'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { slotTime } from '@/lib/adjust-engine'
import { cn } from '@/lib/utils'

const C = {
  grid: 'hsl(217 33% 15%)',
  axis: 'hsl(215 20% 58%)',
  tooltipBg: 'hsl(222 44% 10%)',
  tooltipBd: 'hsl(217 33% 20%)',
  load: '#22d3ee',
  net: '#f59e0b',
}
const TIP = {
  contentStyle: { background: C.tooltipBg, border: `1px solid ${C.tooltipBd}`, borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#e2e8f0' }, labelStyle: { color: '#94a3b8' },
}
const axisTick = { fontSize: 10, fill: C.axis }

export default function NetLoadCard({ dataset }: { dataset: string }) {
  const [open, setOpen] = useState(true)
  const [data, setData] = useState<NetLoadFile | null>(null)
  useEffect(() => { loadNetLoad(dataset).then(setData).catch(() => {}) }, [dataset])

  // 挑新能源(光+风)最大的一天，最能体现净负荷削峰
  const day = useMemo(() => {
    if (!data) return null
    return Object.entries(data).sort((a, b) => {
      const sa = a[1].solar.reduce((s, v) => s + v, 0) + a[1].wind.reduce((s, v) => s + v, 0)
      const sb = b[1].solar.reduce((s, v) => s + v, 0) + b[1].wind.reduce((s, v) => s + v, 0)
      return sb - sa
    })[0]
  }, [data])

  const pts = useMemo(() => {
    if (!day) return []
    const d = day[1]
    return d.load.map((v, i) => ({
      slot: i,
      t: slotTime(i),
      load: Math.round(v),
      net_load: Math.round(d.net_load[i]),
      solar: Math.round(d.solar[i]),
      wind: Math.round(d.wind[i]),
    }))
  }, [day])

  const kpi = useMemo(() => {
    if (!day) return null
    const d = day[1]
    const diff = Math.max(...d.net_load) - Math.min(...d.net_load)
    const renew = Math.max(...d.solar.map((v, i) => v + d.wind[i]))
    const peakLoad = Math.max(...d.load)
    return { diff: Math.round(diff), renew: Math.round(renew), share: (renew / peakLoad) * 100 }
  }, [day])

  if (!data) return null

  return (
    <div className="card-glow rounded-xl p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Waves className="h-3.5 w-3.5 text-amber-400" />
              <span>真实净负荷 · 负荷 − 光伏 − 风电</span>
              <span className="rounded bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{dataset.toUpperCase()} · 2025-06 新能源最大日</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              新能源出力(光+风)把部分负荷"抵消"后，电网实际要承担的<b className="text-amber-300">净负荷</b>，其日内骤升骤降正是爬坡/消纳压力来源。
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3 pt-3">
          <>
            {/* 净负荷峰谷 + 新能源占比 */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Sun className="h-3 w-3 text-yellow-400" />净负荷峰谷差(当日)</div>
                <div className="mt-0.5 font-mono text-[18px] font-semibold text-amber-300">{kpi?.diff ?? '—'} MW</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Sun className="h-3 w-3 text-yellow-400" />新能源出力峰值</div>
                <div className="mt-0.5 font-mono text-[18px] font-semibold text-foreground">{kpi?.renew?.toLocaleString() ?? '—'} MW</div>
              </div>
              <div className="rounded-lg border border-border/60 bg-card/30 px-3 py-2.5">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><Wind className="h-3 w-3 text-sky-400" />新能源占负荷峰值</div>
                <div className="mt-0.5 font-mono text-[18px] font-semibold text-cyan-300">{kpi ? kpi.share?.toFixed(1) : '—'}%</div>
              </div>
            </div>

            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={pts} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                  <XAxis dataKey="t" tick={axisTick} tickLine={false} axisLine={false} interval={15} />
                  <YAxis tick={axisTick} tickLine={false} axisLine={false} width={44} />
                  <Tooltip {...TIP} labelFormatter={() => (day ? day[0] : '')} />
                  <Legend wrapperStyle={{ fontSize: 11 }}
                    formatter={(v: string) => <span style={{ color: C.axis }}>{v === 'load' ? '实际负荷' : v === 'net_load' ? '净负荷' : v}</span>} />
                  <Area type="monotone" dataKey="net_load" name="net_load" stroke={C.net} fill={C.net} fillOpacity={0.12} strokeWidth={2} />
                  <Line type="monotone" dataKey="load" name="load" stroke={C.load} strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <p className="text-[10px] leading-relaxed text-muted-foreground">
              净负荷峰谷差 {kpi?.diff?.toLocaleString()} MW：当日新能源(光+风)最高给负荷"削掉"约 {kpi?.renew?.toLocaleString()} MW({
                kpi?.share?.toFixed(1)}% 峰值)——余下的净负荷才是火电/储能要扛的，其陡降(光伏正午)与陡升(光伏落山)即爬坡风险。
            </p>
          </>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}
