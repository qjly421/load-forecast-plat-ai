import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ReferenceLine, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import {
  LayoutDashboard, Target, ShieldCheck, Zap, ArrowRight,
  TrendingDown, Database, Loader2, Flame, CloudRainWind, Power,
} from 'lucide-react'
import { loadMeta, loadWeather, loadForecast, loadIntervals, loadInstalledCapacity } from '@/lib/data-service'
import { mape } from '@/lib/adjust-engine'
import EnergyMap from '@/sections/home/EnergyMap'
import TimeseriesFeatures from '@/sections/home/TimeseriesFeatures'
import type { ForecastFile, MetaFile, WeatherFile, InstalledCapacityFile } from '@/types/adjust'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { CollapsibleInfo } from '@/components/ui/collapsible-info'
import { cn } from '@/lib/utils'

/** 指标解释文案（ⓘ tooltip 用，中性专业口径） */
const INFO = {
  mape: '平均绝对百分比误差（MAPE）：预测值与实际值的平均偏差占比，越低代表预测越准；1% 即平均每点偏差 1%，是电力行业通用误差口径。',
  picp: '预测区间覆盖率（PICP）：预测不只给一个值，而是给出「下限~上限」区间（如 90% 区间），覆盖率即整月实际负荷真正落进该区间的比例，反映区间是否标得可靠。',
  mpiw: '预测区间平均宽度（MPIW）：区间越窄说明预测越精确、越敢给出确定结论；越宽说明越保守、不确定性越大（常与覆盖率配合看）。',
  peak: '当月全天负荷的最大值，是电网调度与保供电最关注的指标。',
  hot: '当月日均/最高气温最高的一天，高温常推升空调负荷。',
  capacity: '某地区各类电源（火电/风电/光伏/水电/核电等）装机容量占比，反映电源构成与调峰能力。',
}

type Intervals = Record<string, Record<string, unknown>[]>

export default function Home() {
  const navigate = useNavigate()
  const [meta, setMeta] = useState<MetaFile | null>(null)
  const [weather, setWeather] = useState<WeatherFile | null>(null)
  const [fcLgb, setFcLgb] = useState<ForecastFile | null>(null)
  const [fcNn, setFcNn] = useState<ForecastFile | null>(null)
  const [intervals, setIntervals] = useState<Intervals | null>(null)
  const [installed, setInstalled] = useState<InstalledCapacityFile | null>(null)

  useEffect(() => {
    Promise.all([loadMeta(), loadWeather(), loadForecast('lgb'), loadForecast('nn'), loadIntervals(), loadInstalledCapacity()])
      .then(([m, w, l, n, iv, ic]) => {
        setMeta(m); setWeather(w); setFcLgb(l); setFcNn(n); setIntervals(iv); setInstalled(ic)
      })
  }, [])

  const ready = meta && weather && fcLgb && fcNn && intervals && installed

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

  // ---- 电源装机结构 ----
  const capacityData = useMemo(() => {
    if (!installed) return []
    return installed.categories.map((c) => ({
      name: c.name,
      value: c.capacity,
      valueType: c.valueType,
    }))
  }, [installed])

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
            <h1 className="text-sm font-semibold">负荷预测 · 月度运行看板</h1>
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
            <Kpi icon={<Target className="h-3.5 w-3.5 text-cyan-400" />}
              label={<><span>LGB 全月 MAPE（D1）</span><InfoTip title="LGB / NN 全月 MAPE">{INFO.mape}</InfoTip></>}
              value={`${stats.lgb.mape.toFixed(2)}%`} />
            <Kpi icon={<Target className="h-3.5 w-3.5 text-violet-400" />}
              label={<><span>NN 全月 MAPE（D1）</span><InfoTip title="LGB / NN 全月 MAPE">{INFO.mape}</InfoTip></>}
              value={`${stats.nn.mape.toFixed(2)}%`} />
            <Kpi icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
              label={<><span>区间覆盖率 PICP</span><InfoTip title="区间覆盖率 PICP">{INFO.picp}</InfoTip></>}
              value={`${stats.lgb.picp.toFixed(1)}%`} sub={`LGB · NN ${stats.nn.picp.toFixed(1)}% · D1-D14全口径 · 名义90%`} />
            <Kpi icon={<TrendingDown className="h-3.5 w-3.5 text-sky-400" />}
              label={<><span>平均区间宽度</span><InfoTip title="平均区间宽度 MPIW">{INFO.mpiw}</InfoTip></>}
              value={`${Math.round(stats.lgb.mpiw).toLocaleString()}`} unit="MW"
              sub={`NN ${Math.round(stats.nn.mpiw).toLocaleString()} MW`} />
            <Kpi icon={<Zap className="h-3.5 w-3.5 text-rose-400" />}
              label={<><span>月最大峰荷</span><InfoTip title="月最大峰荷">{INFO.peak}</InfoTip></>}
              value={extremes.peakDay.max.toLocaleString()} unit="MW" sub={extremes.peakDay.fullDate} />
            <Kpi icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
              label={<><span>最热日</span><InfoTip title="最热日">{INFO.hot}</InfoTip></>}
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

        {/* 负荷时序特征分析（谷峰/周期性/波动性/异常 · 可折叠） */}
        <TimeseriesFeatures
          days={meta.targetDays}
          fcLgb={fcLgb}
          daily={daily}
        />

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
              <span className="text-[10px] text-muted-foreground">不同温度工况下的区间质量对比</span>
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

        {/* 电源装机结构 */}
        <div className="card-glow rounded-xl p-4">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Power className="h-3.5 w-3.5 text-amber-400" />
              <span>山东电源装机结构</span>
              <InfoTip title="电源装机结构">{INFO.capacity}</InfoTip>
            </h3>
            <span className="text-[10px] text-muted-foreground">{installed.year} 年底 · 单位 万千瓦</span>
          </div>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
            <div style={{ height: 220, width: 220, flexShrink: 0 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={capacityData} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={52} outerRadius={85} paddingAngle={1} stroke="none">
                    {capacityData.map((_, i) => (
                      <Cell key={i} fill={CAP_COLORS[i % CAP_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => {
                      const pct = installed ? ((v / installed.total) * 100).toFixed(1) : ''
                      return [`${v.toLocaleString()} 万千瓦（${pct}%）`, name]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-full flex-1 space-y-1.5">
              {capacityData.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-foreground/90">
                    <span className="h-2 w-2 rounded-full" style={{ background: CAP_COLORS[i % CAP_COLORS.length] }} />
                    {c.name}
                    {c.valueType === 'derived' && (
                      <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">推算</span>
                    )}
                  </span>
                  <span className="text-muted-foreground">
                    {c.value.toLocaleString()} 万千瓦 · {((c.value / installed.total) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            总装机约 {installed.total.toLocaleString()} 万千瓦（≈{(installed.total / 10000).toFixed(2)} 亿千瓦）·
            新能源占比 48.7% 已超煤电。来源：<a className="text-primary/80 underline-offset-2 hover:underline"
              href={installed.sources[0].url} target="_blank" rel="noreferrer">山东省能源局（2024）</a>
            、<a className="text-primary/80 underline-offset-2 hover:underline"
              href={installed.sources[1].url} target="_blank" rel="noreferrer">国家能源局分类型（2024）</a>
            ，推算项见 tooltip。
          </p>
        </div>

        {/* 新能源电力地理 · 山东电源结构背景 */}
        <EnergyMap />

        {/* 数据与口径说明（可折叠） */}
        <CollapsibleInfo>
          数据口径：2025-06 全月 · 目标日 1-30 · 提前期 D1-D14 · LGB / NN 双模型 · 概率区间为分组分裂共形（grouped split conformal）口径。
          负荷为「实际负荷-直调」口径。数据来源：predictions_2025_06 / weather_daily_2025_06 / interval 汇总表，
          装机结构取自山东省能源局与国家能源局公开数据；手动调整结果可在工作台操作记录中回放并导出。
        </CollapsibleInfo>

        {/* 系统定位（页脚能力概述） */}
        <footer className="rounded-xl border border-border/60 bg-card/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          面向电力调度的负荷预测研判工作台：AI 全月预测底稿 · 多模型对比（LGB/NN）· 相似日 / 气象 / 分时段人工修正 ·
          概率区间 · 操作回放与导出。
        </footer>
      </main>
    </div>
  )
}

// 装机结构饼图配色（按 categories 顺序：光伏/风电/煤电/气电/水电/核电/其他）
const CAP_COLORS = ['#fbbf24', '#38bdf8', '#94a3b8', '#fb923c', '#60a5fa', '#a78bfa', '#64748b']

function Kpi({ icon, label, value, unit, sub, tone = 'normal' }: {
  icon: React.ReactNode; label: React.ReactNode; value: string; unit?: string; sub?: string
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
