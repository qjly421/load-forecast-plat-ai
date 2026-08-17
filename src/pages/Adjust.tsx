import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SlidersHorizontal, Eye, EyeOff, Loader2, ShieldCheck, CalendarDays, Cpu, Timer } from 'lucide-react'
import AdjustChart from '@/sections/adjust/AdjustChart'
import AdjustTools from '@/sections/adjust/AdjustTools'
import SimilarPanel from '@/sections/adjust/SimilarPanel'
import WeatherChart from '@/sections/adjust/WeatherChart'
import OpsLog from '@/sections/adjust/OpsLog'
import { applyOps, mape, coverage, fmtMw } from '@/lib/adjust-engine'
import {
  loadMeta, loadWeather, loadSimilar, loadForecast, loadIntervals,
  saveSession, loadSession, exportSession,
} from '@/lib/data-service'
import type {
  AdjustOp, MetaFile, WeatherFile, SimilarFile, ForecastFile, SimilarDay,
} from '@/types/adjust'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export default function Adjust() {
  const [searchParams] = useSearchParams()
  const initDay = searchParams.get('day') ?? '2025-06-15'

  // ---- 数据 ----
  const [meta, setMeta] = useState<MetaFile | null>(null)
  const [weather, setWeather] = useState<WeatherFile | null>(null)
  const [similar, setSimilar] = useState<SimilarFile | null>(null)
  const [forecast, setForecast] = useState<ForecastFile | null>(null)
  const [intervals, setIntervals] = useState<Record<string, Record<string, unknown>[]> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ---- 选择 ----
  const [targetDay, setTargetDay] = useState(initDay)
  const [model, setModel] = useState('lgb')
  const [dayplus, setDayplus] = useState(1)

  // ---- 调整状态 ----
  const [ops, setOps] = useState<AdjustOp[]>([])
  const [previewOp, setPreviewOp] = useState<AdjustOp | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [simDay, setSimDay] = useState<SimilarDay | null>(null)
  const [showActual, setShowActual] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [keypointMode, setKeypointMode] = useState(false)
  const [keypoints, setKeypoints] = useState<{ slot: number; value: number }[]>([])

  // URL 参数变化时同步目标日（从看板跳转）
  useEffect(() => {
    const d = searchParams.get('day')
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) setTargetDay(d)
  }, [searchParams])

  // 初始加载
  useEffect(() => {
    Promise.all([loadMeta(), loadWeather(), loadSimilar(), loadIntervals()])
      .then(([m, w, s, iv]) => {
        setMeta(m); setWeather(w); setSimilar(s); setIntervals(iv)
      })
      .catch((e) => setError(String(e)))
  }, [])

  // 模型数据按需加载
  useEffect(() => {
    setLoading(true)
    loadForecast(model)
      .then(setForecast)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [model])

  // 切换日期/模型/提前期：恢复已保存操作
  useEffect(() => {
    const s = loadSession(model, targetDay, dayplus)
    setOps(s?.ops ?? [])
    setSavedAt(s?.savedAt ?? null)
    setSimDay(null)
    setKeypoints([])
    setKeypointMode(false)
    setPreviewOp(null)
  }, [model, targetDay, dayplus])

  // ---- 派生数据 ----
  const dayFc = forecast?.[targetDay]?.[String(dayplus)] ?? null
  const dayWx = weather?.[targetDay] ?? null
  const prevDay = useMemo(() => {
    if (!weather) return null
    const d = new Date(targetDay)
    d.setDate(d.getDate() - 1)
    const key = d.toISOString().slice(0, 10)
    return weather[key] ?? null
  }, [weather, targetDay])
  const simDays = similar?.[targetDay] ?? []

  const adjusted = useMemo(
    () =>
      dayFc && meta
        ? applyOps(dayFc.center, previewOp ? [...ops, previewOp] : ops, meta.segments)
        : [],
    [dayFc, ops, previewOp, meta],
  )

  const kpis = useMemo(() => {
    if (!dayFc || adjusted.length === 0) return null
    const mape0 = mape(dayFc.center, dayFc.actual)
    const mape1 = mape(adjusted, dayFc.actual)
    const peak = Math.max(...adjusted)
    const peakSlot = adjusted.indexOf(peak)
    const cov = coverage(dayFc.actual, dayFc.lower, dayFc.upper)
    let maxDelta = 0
    for (let i = 0; i < 96; i++) maxDelta = Math.max(maxDelta, Math.abs(adjusted[i] - dayFc.center[i]))
    return { mape0, mape1, peak, peakSlot, cov, maxDelta }
  }, [dayFc, adjusted])

  // 区间质量（所选模型、grouped_split_conformal、2025 正式口径）
  const intervalQuality = useMemo(() => {
    if (!intervals) return null
    const rows = intervals.interval_summary ?? []
    const row = rows.find(
      (r) => r.protocol_group === '2025_formal_no_leakage'
        && r.model_family === model
        && r.interval_method === 'grouped_split_conformal',
    )
    return row ? { picp: Number(row.picp), mpiw: Number(row.mpiw) } : null
  }, [intervals, model])

  // ---- 操作 ----
  const addOp = (op: AdjustOp) => {
    setOps((prev) => [...prev, op])
    setSavedAt(null)
    setPreviewOp(null)
  }
  const undo = () => { setOps((prev) => prev.slice(0, -1)); setSavedAt(null); setPreviewOp(null) }
  const reset = () => { setOps([]); setKeypoints([]); setSavedAt(null); setPreviewOp(null) }

  const save = () => {
    const s = { targetDay, model, dayplus, ops, savedAt: Date.now() }
    saveSession(s)
    setSavedAt(s.savedAt)
  }

  const doExport = () => {
    exportSession({ targetDay, model, dayplus, ops, savedAt: Date.now() }, adjusted, dayFc?.actual ?? [])
  }

  const applyKeypoints = () => {
    if (keypoints.length < 2) return
    addOp({
      id: `op_${Date.now()}_kp`, ts: Date.now(), type: 'keypoints',
      points: [...keypoints].sort((a, b) => a.slot - b.slot),
      label: `关键点重塑（${keypoints.length} 点插值）`,
    })
    setKeypoints([])
    setKeypointMode(false)
  }

  const applySimilar = (d: SimilarDay, blend: number) => {
    addOp({
      id: `op_${Date.now()}_sim`, ts: Date.now(), type: 'similar',
      date: d.date, blend, dailyLoad: d.daily_load,
      label: `混入相似日 ${d.date} 形状（${Math.round(blend * 100)}%）`,
    })
  }

  const onChartClick = (slot: number) => {
    if (slot < 0 || slot > 95) return
    setKeypoints((prev) => {
      const exist = prev.find((p) => p.slot === slot)
      if (exist) return prev.filter((p) => p.slot !== slot)
      const v = Math.round(adjusted[slot] ?? dayFc?.center[slot] ?? 0)
      return [...prev, { slot, value: v }]
    })
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-destructive">
        数据加载失败：{error}
      </div>
    )
  }

  const ready = meta && weather && similar && forecast && dayFc && dayWx

  return (
    <div className="bg-grid min-h-screen bg-background">
      {/* 页面工具栏 */}
      <div className="border-b border-border/80 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center gap-x-5 gap-y-2 px-6 py-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold">山东负荷预测 · 手动调整工作台</h1>
            <Badge variant="outline" className="border-border bg-secondary/60 text-[10px] text-muted-foreground">
              2025-06 口径 · D1-D14 · ec三点
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <ToolbarSelect
              icon={<CalendarDays className="h-3.5 w-3.5" />}
              label="目标日" value={targetDay} onValueChange={setTargetDay}
              options={(meta?.targetDays ?? []).map((d) => ({ value: d, label: d }))}
              width="w-[132px]"
            />
            <ToolbarSelect
              icon={<Cpu className="h-3.5 w-3.5" />}
              label="模型" value={model} onValueChange={setModel}
              options={[{ value: 'lgb', label: 'LGB' }, { value: 'nn', label: 'NN' }]}
              width="w-[88px]"
            />
            <ToolbarSelect
              icon={<Timer className="h-3.5 w-3.5" />}
              label="提前期" value={String(dayplus)} onValueChange={(v) => setDayplus(Number(v))}
              options={(meta?.dayplusOptions ?? [1, 3, 7, 14]).map((d) => ({ value: String(d), label: `D${d}` }))}
              width="w-[76px]"
            />
            <div className="flex items-center gap-1.5">
              {showActual ? <Eye className="h-3.5 w-3.5 text-muted-foreground" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
              <Label htmlFor="sw-actual" className="text-xs text-muted-foreground">实际负荷</Label>
              <Switch id="sw-actual" checked={showActual} onCheckedChange={setShowActual} />
            </div>
            <div className="flex items-center gap-1.5">
              <Label htmlFor="sw-hist" className="text-xs text-muted-foreground">前一日</Label>
              <Switch id="sw-hist" checked={showHistory} onCheckedChange={setShowHistory} />
            </div>
            {intervalQuality && (
              <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground" title="该模型 grouped_split_conformal 区间在 2025 正式口径下的覆盖率/平均宽度">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                区间口径：PICP {(intervalQuality.picp * 100).toFixed(1)}% · 均宽 {fmtMw(intervalQuality.mpiw)} MW
              </div>
            )}
          </div>
        </div>
      </div>

      {(!ready || loading) ? (
        <div className="flex h-[60vh] items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          正在加载 {model.toUpperCase()} 预测数据…
        </div>
      ) : (
        <main className="mx-auto max-w-[1700px] space-y-3 px-6 py-4">
          {/* KPI 条 */}
          {kpis && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi label="原始 MAPE" value={`${kpis.mape0.toFixed(2)}%`} />
              <Kpi
                label="调整后 MAPE"
                value={`${kpis.mape1.toFixed(2)}%`}
                tone={kpis.mape1 < kpis.mape0 ? 'good' : kpis.mape1 > kpis.mape0 ? 'bad' : 'normal'}
                sub={kpis.mape1 !== kpis.mape0 ? `${kpis.mape1 < kpis.mape0 ? '改善' : '变差'} ${Math.abs(kpis.mape1 - kpis.mape0).toFixed(2)}pt` : '未调整'}
              />
              <Kpi label="调整后峰值" value={`${fmtMw(kpis.peak)}`} unit="MW" sub={`slot ${kpis.peakSlot}`} />
              <Kpi label="最大调整幅度" value={`${fmtMw(kpis.maxDelta)}`} unit="MW" />
              <Kpi label="区间覆盖率" value={`${kpis.cov.toFixed(0)}%`} sub="实际落入90%区间" />
              <Kpi label="操作步数" value={String(ops.length)} sub={savedAt ? '已保存' : '未保存'} tone={ops.length > 0 && !savedAt ? 'warn' : 'normal'} />
            </div>
          )}

          {/* 主区 */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[300px_1fr_300px]">
            <AdjustTools
              segments={meta.segments}
              onAddOp={addOp}
              onPreview={setPreviewOp}
              keypointMode={keypointMode}
              onKeypointModeChange={setKeypointMode}
              keypoints={keypoints}
              onKeypointsChange={setKeypoints}
              onApplyKeypoints={applyKeypoints}
            />
            <div className="card-glow rounded-xl p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">
                    {targetDay} 负荷曲线
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {model.toUpperCase()} · D{dayplus}（起报 {dayFc.origin}）
                    </span>
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    背景色带：夜谷 / 早峰 / 午谷 / 晚峰 · 浅蓝带：90% 预测区间
                  </p>
                </div>
                {simDay && (
                  <Badge variant="outline" className="border-violet-400/40 bg-violet-400/10 text-[10px] text-violet-300">
                    叠加相似日 {simDay.date}
                  </Badge>
                )}
              </div>
              <AdjustChart
                forecast={dayFc}
                adjusted={adjusted}
                segments={meta.segments}
                similar={simDay}
                historyDay={prevDay}
                showActual={showActual}
                showHistory={showHistory}
                keypointMode={keypointMode}
                keypoints={keypoints}
                onChartClick={onChartClick}
              />
            </div>
            <SimilarPanel days={simDays} selected={simDay} onSelect={setSimDay} onApply={applySimilar} />
          </div>

          {/* 下区 */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
            <WeatherChart day={dayWx} date={targetDay} />
            <OpsLog ops={ops} savedAt={savedAt} onUndo={undo} onReset={reset} onSave={save} onExport={doExport} />
          </div>
        </main>
      )}
    </div>
  )
}

function ToolbarSelect({ icon, label, value, onValueChange, options, width }: {
  icon: React.ReactNode; label: string; value: string;
  onValueChange: (v: string) => void; options: { value: string; label: string }[]; width: string
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">{icon}{label}</span>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className={cn('h-7 border-border bg-card text-xs', width)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function Kpi({ label, value, unit, sub, tone = 'normal' }: {
  label: string; value: string; unit?: string; sub?: string
  tone?: 'normal' | 'good' | 'bad' | 'warn'
}) {
  const toneClass = {
    normal: 'text-foreground',
    good: 'text-emerald-400',
    bad: 'text-rose-400',
    warn: 'text-amber-400',
  }[tone]
  return (
    <div className="card-glow rounded-xl px-3.5 py-2.5">
      <div className="text-[10px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className={cn('glow-cyan text-lg font-bold tracking-tight', toneClass)}>{value}</span>
        {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  )
}
