import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import {
  LayoutDashboard, Target, ShieldCheck, Thermometer, Zap, ArrowRight,
  TrendingDown, Database, Loader2, Flame, CloudRainWind,
} from 'lucide-react'
import { loadMeta, loadWeather, loadForecast, loadIntervals } from '@/lib/data-service'
import { mape } from '@/lib/adjust-engine'
import type { ForecastFile, MetaFile, WeatherFile } from '@/types/adjust'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Intervals = Record<string, Record<string, unknown>[]>

export default function Home() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState<MetaFile | null>(null)
  const [weather, setWeather] = useState<WeatherFile | null>(null)
  const [fcLgb, setFcLgb] = useState<ForecastFile | null>(null)
  const [fcNn, setFcNn] = useState<ForecastFile | null>(null)
  const [intervals, setIntervals] = useState<Intervals | null>(null)

  useEffect(() => {
    Promise.all([loadMeta(), loadWeather(), loadForecast('lgb'), loadForecast('nn'), loadIntervals()])
      .then(([m, w, l, n, iv]) => {
        setMeta(m); setWeather(w); setFcLgb(l); setFcNn(n); setIntervals(iv)
      })
  }, [])

  const ready = meta && weather && fcLgb && fcNn && intervals

  // ---- 全月统计 ----
  const stats = useMemo(() => {
    if (!ready) return null
    // MAPE：按 D1 口径实时计算（逐时点合并）
    const calc = (fc: ForecastFile) => {
      const preds: number[] = []
      const acts: number[] = []
      for (const day of Object.values(fc)) {
        const d1 = day['1']
        if (!d1) continue
        for (let i = 0; i < 96; i++) {
          preds.push(d1.center[i])
          acts.push(d1.actual[i])
        }
      }
      return mape(preds, acts)
    }
    // PICP / MPIW：读取 interval_summary 权威口径（全 D1-D14 合并）
    const summary = (m: string) => {
      const row = (intervals.interval_summary ?? []).find(
        (r) => r.protocol_group === '2025_formal_no_leakage'
          && r.model_family === m
          && r.interval_method === 'grouped_split_conformal',
      )
      return row
        ? { picp: Number(row.picp) * 100, mpiw: Number(row.mpiw) }
        : { picp: 0, mpiw: 0 }
    }
    return {
      lgb: { mape: calc(fcLgb), ...summary('lgb') },
      nn: { mape: calc(fcNn), ...summary('nn') },
    }
  }, [ready, fcLgb, fcNn, intervals])

  // ---- 逐日聚合（用于全月曲线） ----
  const daily = useMemo(() => {
    if (!ready) return []
    return meta.targetDays.map((d) => {
      const f = fcLgb[d]?.['1']
      const w = weather[d]
      const act = f?.actual ?? w?.load ?? []
      return {
        date: d.slice(5),
        fullDate: d,
        max: act.length ? Math.round(Math.max(...act)) : 0,
        min: act.length ? Math.round(Math.min(...act)) : 0,
        mean: act.length ? Math.round(act.reduce((s, v) => s + v, 0) / act.length) : 0,
        centerMax: f ? Math.round(Math.max(...f.center)) : 0,
        temp: w ? Math.round((w.temp.reduce((s, v) => s + v, 0) / 96) * 10) / 10 : 0,
        tempMax: w ? Math.round(Math.max(...w.temp) * 10) / 10 : 0,
        prec: w ? Math.round(w.prec.reduce((s, v) => s + v, 0) * 10) / 10 : 0,
      }
    })
  }, [ready, meta, fcLgb, weather])

  // ---- 区间质量：按提前期桶 ----
  const horizonQuality = useMemo(() => {
    if (!ready) return []
    const rows = intervals.interval_by_horizon ?? []
    const buckets = ['D1_D5', 'D6_D10', 'D11_D14']
    return buckets.map((b) => {
      const find = (m: string) =>
        rows.find(
          (r) => r.protocol_group === '2025_formal_no_leakage'
            && r.model_family === m
            && r.interval_method === 'grouped_split_conformal'
            && r.horizon_bucket === b,
        )
      const l = find('lgb')
      const n = find('nn')
      return {
        bucket: b.replace('_', '-').replace('_', ' ~ '),
        lgb: l ? Math.round(Number(l.picp) * 1000) / 10 : 0,
        nn: n ? Math.round(Number(n.picp) * 1000) / 10 : 0,
        lgbW: l ? Math.round(Number(l.mpiw)) : 0,
        nnW: n ? Math.round(Number(n.mpiw)) : 0,
      }
    })
  }, [ready, intervals])

  // ---- 区间质量：按温度 regime ----
  const regimeQuality = useMemo(() => {
    if (!ready) return []
    const rows = intervals.interval_by_temperature_regime ?? []
    const regimes = [...new Set(rows.map((r) => String(r.temperature_regime)))]
    return regimes.map((rg) => {
      const find = (m: string) =>
        rows.find(
          (r) => r.model_family === m
            && r.interval_method === 'grouped_split_conformal'
            && r.temperature_regime === rg,
        )
      const l = find('lgb')
      const n = find('nn')
      return {
        regime: rg === 'hot' ? '高温 regime' : rg === 'normal' ? '常温 regime' : rg,
        lgb: l ? Math.round(Number(l.picp) * 1000) / 10 : 0,
        nn: n ? Math.round(Number(n.picp) * 1000) / 10 : 0,
      }
    })
  }, [ready, intervals])

  const extremes = useMemo(() => {
    if (!daily.length) return null
    const peakDay = daily.reduce((a, b) => (b.max > a.max ? b : a))
    const hotDay = daily.reduce((a, b) => (b.tempMax > a.tempMax ? b : a))
    return { peakDay, hotDay }
  }, [daily])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        正在加载 2025-06 真实预测数据…
      </div>
    )
  }

  return (
    <div className="bg-grid min-h-screen bg-background">
      {/* 页面头 */}
      <div className="border-b border-border/80 bg-background/85">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-2 px-6 py-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">山东负荷预测 · 月度运行看板</h1>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-400">
              <Database className="mr-1 h-3 w-3" />真实数据
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>口径：2025-06 · D1-D14 · stage4 · ec三点 · seed 3407</span>
            <button
              onClick={() => navigate('/adjust')}
              className="flex items-center gap-1 rounded-md bg-primary/15 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/25"
            >
              进入手动调整 <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] space-y-3 px-6 py-4">
        {/* KPI 条 */}
        {stats && extremes && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={<Target className="h-3.5 w-3.5 text-cyan-400" />} label="LGB 全月 MAPE（D1）"
              value={`${stats.lgb.mape.toFixed(2)}%`} />
            <Kpi icon={<Target className="h-3.5 w-3.5 text-violet-400" />} label="NN 全月 MAPE（D1）"
              value={`${stats.nn.mape.toFixed(2)}%`} />
            <Kpi icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />} label="区间覆盖率 PICP"
              value={`${stats.lgb.picp.toFixed(1)}%`} sub={`LGB · NN ${stats.nn.picp.toFixed(1)}% · D1-D14全口径 · 名义90%`}
              tone="warn" />
            <Kpi icon={<TrendingDown className="h-3.5 w-3.5 text-sky-400" />} label="平均区间宽度"
              value={`${Math.round(stats.lgb.mpiw).toLocaleString()}`} unit="MW"
              sub={`NN ${Math.round(stats.nn.mpiw).toLocaleString()} MW`} />
            <Kpi icon={<Zap className="h-3.5 w-3.5 text-rose-400" />} label="月最大峰荷"
              value={extremes.peakDay.max.toLocaleString()} unit="MW" sub={extremes.peakDay.fullDate} />
            <Kpi icon={<Flame className="h-3.5 w-3.5 text-orange-400" />} label="最热日"
              value={`${extremes.hotDay.tempMax}°C`} sub={extremes.hotDay.fullDate} />
          </div>
        )}

        {/* 全月逐日负荷 */}
        <div className="card-glow rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">2025-06 逐日负荷运行域</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                色带：当日实际负荷最小~最大 · 白线：日均负荷 · 橙线：日均气温 · 点击某日进入手动调整
              </p>
            </div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={daily}
                margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                onClick={(s) => {
                  const p = (s as { activePayload?: { payload?: { fullDate?: string } }[] })?.activePayload
                  const d = p?.[0]?.payload?.fullDate
                  if (d) navigate(`/adjust?day=${d}`)
                }}
                className="cursor-pointer"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false}
                  axisLine={{ stroke: 'hsl(217 33% 18%)' }} interval={1} />
                <YAxis yAxisId="l" domain={['dataMin - 3000', 'dataMax + 3000']}
                  tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={40} />
                <YAxis yAxisId="t" orientation="right" domain={[10, 40]}
                  tick={{ fontSize: 10, fill: 'hsl(25 90% 60%)' }} tickLine={false} axisLine={false}
                  unit="°" width={32} />
                <Tooltip
                  contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => {
                    const m: Record<string, [string, string]> = {
                      max: ['日最大负荷', ' MW'], min: ['日最小负荷', ' MW'],
                      mean: ['日均负荷', ' MW'], temp: ['日均气温', ' °C'],
                    }
                    const [label, unit] = m[name] ?? [name, '']
                    return [`${v.toLocaleString()}${unit}`, label]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(v: string) => {
                    const m: Record<string, string> = { mean: '日均负荷', max: '日最大', min: '日最小', temp: '日均气温（右轴）' }
                    return <span style={{ color: 'hsl(215 20% 70%)' }}>{m[v] ?? v}</span>
                  }} />
                <Area yAxisId="l" dataKey="max" stroke="none" fill="#38bdf8" fillOpacity={0.12} isAnimationActive={false} />
                <Area yAxisId="l" dataKey="min" stroke="none" fill="hsl(222 47% 8.5%)" fillOpacity={1} isAnimationActive={false} legendType="none" />
                <Line yAxisId="l" type="monotone" dataKey="mean" stroke="hsl(210 40% 88%)" strokeWidth={1.8} dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="max" stroke="#38bdf8" strokeWidth={1} strokeOpacity={0.5} dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="min" stroke="#38bdf8" strokeWidth={1} strokeOpacity={0.5} dot={false} />
                <Line yAxisId="t" type="monotone" dataKey="temp" stroke="hsl(25 90% 60%)" strokeWidth={1.4}
                  strokeDasharray="5 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 区间质量两图 */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="card-glow rounded-xl p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">区间覆盖率 · 按提前期</h3>
              <span className="text-[10px] text-muted-foreground">grouped_split_conformal · 目标 90%</span>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={horizonQuality} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false}
                    axisLine={false} unit="%" width={36} />
                  <Tooltip contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v}%`, name === 'lgb' ? 'LGB' : 'NN']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'hsl(215 20% 70%)' }}>{v === 'lgb' ? 'LGB' : 'NN'}</span>} />
                  <ReferenceLine y={90} stroke="hsl(142 70% 50%)" strokeDasharray="5 4"
                    label={{ value: '名义 90%', position: 'insideTopRight', fill: 'hsl(142 70% 60%)', fontSize: 10 }} />
                  <Bar dataKey="lgb" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={30} />
                  <Bar dataKey="nn" fill="#a78bfa" radius={[4, 4, 0, 0]} barSize={30} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-glow rounded-xl p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">区间覆盖率 · 按温度 regime</h3>
              <span className="text-[10px] text-muted-foreground">高温时段区间明显偏窄</span>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={regimeQuality} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                  <XAxis dataKey="regime" tick={{ fontSize: 11, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false}
                    axisLine={false} unit="%" width={36} />
                  <Tooltip contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [`${v}%`, name === 'lgb' ? 'LGB' : 'NN']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'hsl(215 20% 70%)' }}>{v === 'lgb' ? 'LGB' : 'NN'}</span>} />
                  <ReferenceLine y={90} stroke="hsl(142 70% 50%)" strokeDasharray="5 4"
                    label={{ value: '名义 90%', position: 'insideTopRight', fill: 'hsl(142 70% 60%)', fontSize: 10 }} />
                  <Bar dataKey="lgb" radius={[4, 4, 0, 0]} barSize={30}>
                    {regimeQuality.map((r, i) => (
                      <Cell key={i} fill={r.regime.includes('高温') ? '#fb7185' : '#22d3ee'} />
                    ))}
                  </Bar>
                  <Bar dataKey="nn" fill="#a78bfa" radius={[4, 4, 0, 0]} barSize={30} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 月气象趋势 */}
        <div className="card-glow rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">2025-06 气象趋势</h3>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <CloudRainWind className="h-3.5 w-3.5 text-sky-400" />
              柱状：日降水 · 橙线：日均温 · 红虚线：日最高温
            </div>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} interval={1} />
                <YAxis yAxisId="t" domain={[0, 40]} tick={{ fontSize: 10, fill: 'hsl(25 90% 60%)' }}
                  tickLine={false} axisLine={false} unit="°" width={32} />
                <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 10, fill: 'hsl(200 90% 60%)' }}
                  tickLine={false} axisLine={false} unit="mm" width={36} />
                <Tooltip contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => {
                    const m: Record<string, [string, string]> = {
                      temp: ['日均气温', ' °C'], tempMax: ['日最高温', ' °C'], prec: ['日降水', ' mm'],
                    }
                    const [label, unit] = m[name] ?? [name, '']
                    return [`${v}${unit}`, label]
                  }} />
                <Bar yAxisId="p" dataKey="prec" fill="hsl(200 90% 55%)" fillOpacity={0.5} radius={[2, 2, 0, 0]} barSize={10} />
                <Line yAxisId="t" type="monotone" dataKey="temp" stroke="hsl(25 90% 60%)" strokeWidth={1.6} dot={false} />
                <Line yAxisId="t" type="monotone" dataKey="tempMax" stroke="hsl(0 80% 62%)" strokeWidth={1.1}
                  strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 口径说明 */}
        <div className="rounded-xl border border-border bg-card/60 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <Thermometer className="mr-1 inline h-3.5 w-3.5 text-orange-400" />
          数据来源：predictions_2025_06 / weather_daily_2025_06 / interval 汇总表（grouped_split_conformal 口径）。
          负荷为「实际负荷-直调」口径。注意区间实测 PICP（LGB 55.1% / NN 68.4%）低于名义 90%，高温 regime 下区间覆盖进一步下降，
          手动调整时建议结合 TopK 相似期与气象趋势综合判断。
        </div>
      </main>
    </div>
  )
}

function Kpi({ icon, label, value, unit, sub, tone = 'normal' }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; sub?: string
  tone?: 'normal' | 'warn'
}) {
  return (
    <div className="card-glow rounded-xl px-3.5 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('glow-cyan text-lg font-bold tracking-tight', tone === 'warn' ? 'text-amber-400' : 'text-foreground')}>
          {value}
        </span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
