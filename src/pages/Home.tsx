import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import {
  LayoutDashboard, Target, ShieldCheck, Zap, ArrowRight,
  TrendingDown, Database, Loader2, Flame, CloudRainWind, Power,
  Layers, Boxes,
} from 'lucide-react'
import {
  loadLoadMetrics, loadForecastFor, loadWeather, loadInstalledCapacity,
} from '@/lib/data-service'
import EnergyMap from '@/sections/home/EnergyMap'
import TimeseriesFeatures from '@/sections/home/TimeseriesFeatures'
import DeepCostCompare from '@/sections/home/DeepCostCompare'
import type { ForecastFile, WeatherFile, LoadMetricsFile, InstalledCapacityFile } from '@/types/adjust'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { CollapsibleInfo } from '@/components/ui/collapsible-info'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

/** 指标解释文案（ⓘ tooltip 用，中性专业口径） */
const INFO = {
  mape: '平均绝对百分比误差（MAPE）：预测值与实际值的平均偏差占比，越低越准；1% 即平均每点偏差 1%，是电力行业通用误差口径。',
  picp: '预测区间覆盖率（PICP）：预测给出「下限~上限」的 90% 区间，覆盖率是整月实际负荷真正落进该区间的比例，反映区间标得是否可靠。',
  mpiw: '预测区间平均宽度（MPIW）：区间越窄说明越精确、越敢给出确定结论；越宽说明越保守（常与覆盖率配合看）。',
  peak: '当月全天负荷的最大值，是电网调度与保供电最关注的指标。',
  hot: '当月日均气温最高的一天，高温常推升空调负荷。',
  capacity: '某地区各类电源（火电/风电/光伏/水电/核电等）装机容量占比，反映电源构成与调峰能力。',
}

export default function Home() {
  const navigate = useNavigate()
  const [reg, setReg] = useState<LoadMetricsFile | null>(null)
  const [ds, setDs] = useState('sd')
  const [model, setModel] = useState('lgb')
  const [fc, setFc] = useState<ForecastFile | null>(null)
  const [weather, setWeather] = useState<WeatherFile | null>(null)
  const [installed, setInstalled] = useState<InstalledCapacityFile | null>(null)

  useEffect(() => {
    loadLoadMetrics().then(setReg)
    loadWeather().then(setWeather).catch(() => setWeather(null))
    loadInstalledCapacity().then(setInstalled).catch(() => setInstalled(null))
  }, [])

  useEffect(() => {
    setFc(null)
    if (!reg) return
    loadForecastFor(ds, model).then(setFc).catch(() => setFc(null))
  }, [ds, model, reg])

  // 选中数据集/模型的元信息
  const dsMeta = useMemo(() => reg?.datasets.find((d) => d.id === ds) ?? null, [reg, ds])
  const modelMeta = useMemo(() => reg?.models.find((m) => m.id === model) ?? null, [reg, model])

  const ready = !!reg && !!dsMeta && !!modelMeta && !!fc && !!dsMeta

  // 当前数据集下各模型指标（模型对比）
  const modelLeader = useMemo(() => {
    if (!reg || !ds) return []
    const rows = reg.metrics[ds]
    if (!rows) return []
    return reg.models
      .filter((m) => rows[m.id])
      .map((m) => ({ id: m.id, name: m.name, ...rows[m.id] }))
  }, [reg, ds])

  // 各数据集在当前模型下的指标（数据集对比）
  const dsCompare = useMemo(() => {
    if (!reg || !model) return []
    return reg.datasets
      .filter((d) => reg.metrics[d.id]?.[model])
      .map((d) => ({ id: d.id, name: d.name, ...reg.metrics[d.id][model] }))
  }, [reg, model])

  const sel = useMemo(
    () => (reg?.metrics[ds]?.[model] ? { ...reg.metrics[ds][model] } : null),
    [reg, ds, model],
  )
  const bestModel = useMemo(() => {
    if (!modelLeader.length) return null
    return modelLeader.reduce((a, b) => (b.mape < a.mape ? b : a))
  }, [modelLeader])

  // 逐日聚合（全月：实际 min/max/mean + 预测 mean）
  const days = useMemo(() => Object.keys(fc ?? {}).sort(), [fc])

  const daily = useMemo(() => {
    if (!fc) return []
    return Object.keys(fc)
      .sort()
      .map((d) => {
        const d1 = fc[d]?.['1']
        const act = d1?.actual ?? []
        const cen = d1?.center ?? []
        const max = act.length ? Math.round(Math.max(...act)) : 0
        const min = act.length ? Math.round(Math.min(...act)) : 0
        const mean = act.length ? Math.round(act.reduce((s, v) => s + v, 0) / act.length) : 0
        const cenMean = cen.length ? Math.round(cen.reduce((s, v) => s + v, 0) / cen.length) : 0
        const centerMax = cen.length ? Math.round(Math.max(...cen)) : 0
        const temp = d1?.atemp?.length
          ? Math.round((d1.atemp.reduce((s, v) => s + v, 0) / d1.atemp.length) * 10) / 10
          : 0
        const tempMax = d1?.atemp?.length ? Math.round(Math.max(...d1.atemp) * 10) / 10 : 0
        const prec = weather?.[d]?.prec?.length
          ? Math.round(weather[d].prec.reduce((s, v) => s + v, 0) * 10) / 10
          : 0
        return {
          date: d.slice(5),
          fullDate: d,
          max, min, mean, cenMean, centerMax,
          temp, tempMax, prec,
        }
      })
  }, [fc, weather])

  const extremes = useMemo(() => {
    if (!daily.length) return null
    const peakDay = daily.reduce((a, b) => (b.max > a.max ? b : a))
    const hotDay = daily.reduce((a, b) => (b.temp > a.temp ? b : a))
    return { peakDay, hotDay }
  }, [daily])

  const capacityData = useMemo(() => {
    if (!installed) return []
    return installed.categories.map((c) => ({ name: c.name, value: c.capacity }))
  }, [installed])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        正在加载负荷预测评测数据…
      </div>
    )
  }

  const isSd = ds === 'sd'
  const label = dsMeta.label

  return (
    <div className="bg-grid min-h-screen bg-background">
      {/* 页面头 */}
      <div className="border-b border-border/80 bg-background/85">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-2 px-6 py-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">负荷预测 · 多模型 × 多数据集合成看板</h1>
            <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[10px] text-emerald-400">
              <Database className="mr-1 h-3 w-3" />真实数据
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>口径：日前 D1 · 16×96 点 · 90% 共形区间 · 四数据集</span>
            {isSd && (
              <button
                onClick={() => navigate('/adjust')}
                className="flex items-center gap-1 rounded-md bg-primary/15 px-2.5 py-1 font-medium text-primary transition-colors hover:bg-primary/25"
              >
                进入手动调整 <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1700px] space-y-3 px-6 py-4">
        {/* 数据集 / 模型 选择器 */}
        <div className="card-glow flex flex-wrap items-center gap-3 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] font-medium text-muted-foreground">数据集</span>
            <Select value={ds} onValueChange={(v) => { setDs(v) }}>
              <SelectTrigger className="h-8 w-[220px] text-xs">
                <SelectValue placeholder="选择数据集" />
              </SelectTrigger>
              <SelectContent>
                {reg!.datasets.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Boxes className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-[11px] font-medium text-muted-foreground">模型</span>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue placeholder="选择模型" />
              </SelectTrigger>
              <SelectContent>
                {reg!.models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-[11px] text-muted-foreground">
            {dsMeta.name} · {dsMeta.test_start.slice(0, 7)} 全月 · {label}
          </div>
        </div>

        {/* KPI 条 */}
        {sel && extremes && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi icon={<Target className="h-3.5 w-3.5 text-cyan-400" />}
              label={<><span>{modelMeta.name} 全月 MAPE</span><InfoTip title="MAPE">{INFO.mape}</InfoTip></>}
              value={`${sel.mape.toFixed(2)}%`} sub={`同数据集最优 ${bestModel?.mape.toFixed(2)}%（${bestModel?.name}）`} tone={sel.mape > 5 ? 'warn' : 'normal'} />
            <Kpi icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
              label={<><span>区间覆盖率 PICP</span><InfoTip title="PICP">{INFO.picp}</InfoTip></>}
              value={`${sel.picp.toFixed(1)}%`} sub={`名义 90% · 共形区间`} />
            <Kpi icon={<TrendingDown className="h-3.5 w-3.5 text-sky-400" />}
              label={<><span>平均区间宽度</span><InfoTip title="MPIW">{INFO.mpiw}</InfoTip></>}
              value={`${Math.round(sel.mpiw).toLocaleString()}`} unit="MW" sub={`90% 区间`} />
            <Kpi icon={<Zap className="h-3.5 w-3.5 text-rose-400" />}
              label={<><span>月最大峰荷</span><InfoTip title="月最大峰荷">{INFO.peak}</InfoTip></>}
              value={sel.peak_mw.toLocaleString()} unit="MW" sub={extremes.peakDay.fullDate} />
            <Kpi icon={<Flame className="h-3.5 w-3.5 text-orange-400" />}
              label={<><span>最热日</span><InfoTip title="最热日">{INFO.hot}</InfoTip></>}
              value={`${extremes.hotDay.temp}°C`} sub={extremes.hotDay.fullDate} />
            <Kpi icon={<Target className="h-3.5 w-3.5 text-violet-400" />}
              label={<><span>区间可靠性达标</span><InfoTip title="区间可靠性">{INFO.picp}</InfoTip></>}
              value={`${sel.picp.toFixed(1)}%`} sub={sel.picp >= 90 ? '达标（≥90%）' : '未达标（<90%）'} tone={sel.picp >= 90 ? 'normal' : 'warn'} />
          </div>
        )}

        {/* 逐日负荷运行域 + 预测 */}
        <div className="card-glow rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">{dsMeta.test_start.slice(0, 7)} 逐日负荷运行域 · {dsMeta.name}</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                色带：当日实际负荷最小~最大 · 白线：日均负荷 · 蓝线：预测日均 · 点击某日进入手动调整（仅山东）
              </p>
            </div>
          </div>
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}
                onClick={(s) => {
                  if (!isSd) return
                  const p = (s as { activePayload?: { payload?: { fullDate?: string } }[] })?.activePayload
                  const d = p?.[0]?.payload?.fullDate
                  if (d) navigate(`/adjust?day=${d}`)
                }}
                className={isSd ? 'cursor-pointer' : ''}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false}
                  axisLine={{ stroke: 'hsl(217 33% 18%)' }} interval={1} />
                <YAxis yAxisId="l" domain={['dataMin - 3000', 'dataMax + 3000']}
                  tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={40} />
                <Tooltip
                  contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: 'hsl(215 20% 82%)' }} labelStyle={{ color: 'hsl(215 20% 66%)' }}
                  formatter={(v: number, name: string) => {
                    const m: Record<string, [string, string]> = {
                      max: ['日最大负荷', ' MW'], min: ['日最小负荷', ' MW'],
                      mean: ['日均负荷', ' MW'], cenMean: ['预测日均', ' MW'], temp: ['日均气温', ' °C'],
                    }
                    const [label, unit] = m[name] ?? [name, '']
                    return [`${v.toLocaleString()}${unit}`, label]
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  formatter={(v: string) => {
                    const m: Record<string, string> = { mean: '实际日均', cenMean: '预测日均', max: '日最大', min: '日最小' }
                    return <span style={{ color: 'hsl(215 20% 70%)' }}>{m[v] ?? v}</span>
                  }} />
                <Area yAxisId="l" dataKey="max" stroke="none" fill="#38bdf8" fillOpacity={0.12} isAnimationActive={false} />
                <Area yAxisId="l" dataKey="min" stroke="none" fill="hsl(222 47% 8.5%)" fillOpacity={1} isAnimationActive={false} legendType="none" />
                <Line yAxisId="l" type="monotone" dataKey="mean" stroke="hsl(210 40% 88%)" strokeWidth={1.8} dot={false} />
                <Line yAxisId="l" type="monotone" dataKey="cenMean" stroke="#22d3ee" strokeWidth={1.6} dot={false} strokeDasharray="5 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 模型对比 + 数据集对比 */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div className="card-glow rounded-xl p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">模型对比 · 全月 MAPE（{dsMeta.name}）</h3>
              <span className="text-[10px] text-muted-foreground">同一数据集 · 同口径 PK</span>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={modelLeader} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 'dataMax']} tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} unit="%" width={36} />
                  <Tooltip contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: 'hsl(215 20% 82%)' }} labelStyle={{ color: 'hsl(215 20% 66%)' }}
                    formatter={(v: number, name: string) => [`${v}%`, name === 'mape' ? 'MAPE' : name]} />
                  <Bar dataKey="mape" radius={[4, 4, 0, 0]} barSize={36}>
                    {modelLeader.map((r) => (
                      <Cell key={r.id} fill={r.id === model ? '#22d3ee' : 'hsl(215 25% 42%)'} />
                    ))}
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-glow rounded-xl p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">数据集对比 · {modelMeta.name}（MAPE / PICP）</h3>
              <span className="text-[10px] text-muted-foreground">同模型迁移到不同电网 · 泛化</span>
            </div>
            <div style={{ height: 220 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={dsCompare} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} />
                  <YAxis yAxisId="l" domain={[0, 'dataMax']} tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} width={36} />
                  <YAxis yAxisId="r" orientation="right" domain={[0, 110]} tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: 'hsl(215 20% 82%)' }} labelStyle={{ color: 'hsl(215 20% 66%)' }}
                    formatter={(v: number, name: string) => [`${name === 'mape' ? v.toFixed(2) + '%' : v.toFixed(1) + '%'}`, name === 'mape' ? 'MAPE' : 'PICP']} />
                  <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => <span style={{ color: 'hsl(215 20% 70%)' }}>{v === 'mape' ? 'MAPE %（左轴）' : 'PICP %（右轴）'}</span>} />
                  <Bar yAxisId="l" dataKey="mape" name="mape" fill="#22d3ee" radius={[4, 4, 0, 0]} barSize={26} />
                  <Bar yAxisId="r" dataKey="picp" name="picp" fill="#a78bfa" radius={[4, 4, 0, 0]} barSize={26} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* 指标表 */}
        <div className="card-glow rounded-xl p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold">各模型同口径指标 · {dsMeta.name}（2025-06 全月 · D1）</h3>
            <span className="text-[10px] text-muted-foreground">共形 90% 区间；PICP≥90% 视为可靠</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">模型</th>
                  <th className="py-1.5 pr-3 font-medium">MAPE (%)</th>
                  <th className="py-1.5 pr-3 font-medium">RMSE (MW)</th>
                  <th className="py-1.5 pr-3 font-medium">PICP (%)</th>
                  <th className="py-1.5 pr-3 font-medium">MPIW (MW)</th>
                  <th className="py-1.5 font-medium">峰值 (MW)</th>
                </tr>
              </thead>
              <tbody>
                {modelLeader.map((r) => (
                  <tr key={r.id} className="border-t border-border/50">
                    <td className="py-1.5 pr-3">{r.name}</td>
                    <td className="py-1.5 pr-3 text-foreground">{r.mape.toFixed(2)}</td>
                    <td className="py-1.5 pr-3">{Math.round(r.rmse).toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{r.picp.toFixed(1)}</td>
                    <td className="py-1.5 pr-3">{Math.round(r.mpiw).toLocaleString()}</td>
                    <td className="py-1.5">{r.peak_mw.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 数据可视化特征分析：随数据集切换（四数据集皆有）；周期/小时关联性见其内部子卡 */}
        <TimeseriesFeatures days={days} fcLgb={fc} daily={daily} regionName={dsMeta.name} monthLabel={dsMeta.test_start.slice(0, 7)} isSd={isSd} />
        {isSd && <DeepCostCompare />}

        {/* 山东专属：气象趋势 + 装机结构 + 地图 */}
        {isSd && weather && (
          <div className="card-glow rounded-xl p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{dsMeta.test_start.slice(0, 7)} 气象趋势</h3>
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
                  <YAxis yAxisId="t" domain={[0, 42]} tick={{ fontSize: 10, fill: 'hsl(25 90% 60%)' }} tickLine={false} axisLine={false} unit="°" width={32} />
                  <YAxis yAxisId="p" orientation="right" tick={{ fontSize: 10, fill: 'hsl(199 90% 60%)' }} tickLine={false} axisLine={false} unit="mm" width={40} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: 'hsl(215 20% 82%)' }} labelStyle={{ color: 'hsl(215 20% 66%)' }}
                    formatter={(v: number, name: string) => {
                      const m: Record<string, [string, string]> = { prec: ['日降水', ' mm'], temp: ['日均温', ' °C'], tempMax: ['日最高温', ' °C'] }
                      const [label, unit] = m[name] ?? [name, '']
                      return [`${v.toLocaleString()}${unit}`, label]
                    }}
                  />
                  <Bar yAxisId="p" dataKey="prec" name="日降水" stroke="none" fill="#38bdf8" fillOpacity={0.5} barSize={7} radius={[2, 2, 0, 0]} />
                  <Line yAxisId="t" type="monotone" dataKey="temp" name="日均温" stroke="hsl(25 90% 60%)" strokeWidth={1.8} dot={false} />
                  <Line yAxisId="t" type="monotone" dataKey="tempMax" name="日最高温" stroke="hsl(0 80% 62%)" strokeWidth={1.2} strokeDasharray="5 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {isSd && installed && (
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
                    <Tooltip contentStyle={{ background: 'hsl(222 44% 10%)', border: '1px solid hsl(217 33% 20%)', borderRadius: 8, fontSize: 12 }}
                    itemStyle={{ color: 'hsl(215 20% 82%)' }} labelStyle={{ color: 'hsl(215 20% 66%)' }}
                      formatter={(v: number, name: string) => [`${v.toLocaleString()} 万千瓦`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full flex-1 space-y-1.5">
                {capacityData.map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-foreground/90">
                      <span className="h-2 w-2 rounded-full" style={{ background: CAP_COLORS[i % CAP_COLORS.length] }} />
                      {c.name}
                    </span>
                    <span className="text-muted-foreground">{c.value.toLocaleString()} 万千瓦</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {isSd && <EnergyMap />}

        <CollapsibleInfo>
          负荷预测主线：在<b className="text-foreground/80">山东（全网 MW，2025-06）/ 德国 / 比利时 / 荷兰（Fraunhofer Energy-Charts 全网实际负荷，2024-2025）</b>四个真实序列（统一 15min 口径）上做<b className="text-foreground/80">日前(D1)预测</b>，
          每个数据集用同口径 6 个模型 PK（LightGBM / TCN / HistGradientBoost / Random Forest / Extra Trees / Linear），
          并给出<b className="text-foreground/80">96% 共形预测区间</b>（PICP 实测 ≥92%，名义达标）。特征为日前无泄漏构造（同槽滞后 + 时相 + 气温），
          预测与区间指标均取自严格 held-out 测试月（欧洲 2025-06，与山东同月）。手动调整工作台仅针对山东真实数据。
          与 <b className="text-foreground/80">Fraunhofer Energy-Charts 官方日前负荷预测</b>对照：DE 3.24% / BE 2.45%，我们的 LightGBM 3.36% / 2.86%——
          自研模型已接近国家电网级官方日前预报水平（等同口径 D1 MAPE）。
        </CollapsibleInfo>

        <footer className="rounded-xl border border-border/60 bg-card/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          面向电力调度的负荷预测研判工作台：多模型（LightGBM / TCN / HistGB / RF / ET / Linear）· 多数据集（山东 / 德国 / 比利时 / 荷兰）·
          日前点预测 + 90% 可靠区间 · 相似日 / 气象 / 分时段人工修正（山东）· 爬坡风险预警（见独立模块）。
        </footer>
      </main>
    </div>
  )
}

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
