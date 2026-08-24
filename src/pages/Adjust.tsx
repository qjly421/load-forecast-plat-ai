import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SlidersHorizontal, Eye, EyeOff, Loader2, ShieldCheck, CalendarDays, Cpu, Timer } from 'lucide-react'
import AdjustChart from '@/sections/adjust/AdjustChart'
import AdjustTools from '@/sections/adjust/AdjustTools'
import SimilarPanel from '@/sections/adjust/SimilarPanel'
import EffectPanel from '@/sections/adjust/EffectPanel'
import WeatherChart from '@/sections/adjust/WeatherChart'
import OpsLog from '@/sections/adjust/OpsLog'
import { applyOps, mape, coverage, fmtMw } from '@/lib/adjust-engine'
import {
  loadMeta, loadWeather, loadSimilar, loadForecast,
  saveSession, loadSession, exportSession,
} from '@/lib/data-service'
import type {
  AdjustOp, MetaFile, WeatherFile, SimilarFile, ForecastFile, SimilarDay, DayForecast,
} from '@/types/adjust'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { InfoTip } from '@/components/ui/info-tip'
import { cn } from '@/lib/utils'

/** 指标解释文案（ⓘ tooltip 用，中性专业口径） */
const INFO = {
  days: '提前多少天预测：D1=提前1天、D14=提前14天。提前期越长，天气/负荷不确定性越大，难度越高。',
  picp: '预测区间覆盖率（PICP）：预测不只给一个值，而是给出「下限~上限」区间（如 90% 区间），覆盖率即实际负荷真正落进该区间的比例，反映区间是否标得可靠。',
  segs: '电网日内典型时段：凌晨低谷为「夜谷」，早晨上班高峰为「早峰」，白天平谷为「午谷」，晚间照明高峰为「晚峰」。',
}

export default function Adjust() {
  const [searchParams] = useSearchParams()
  const initDay = searchParams.get('day') ?? '2025-06-15'

  // ---- 数据 ----
  const [meta, setMeta] = useState<MetaFile | null>(null)
  const [weather, setWeather] = useState<WeatherFile | null>(null)
  const [similar, setSimilar] = useState<SimilarFile | null>(null)
  const [forecast, setForecast] = useState<ForecastFile | null>(null)
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
    Promise.all([loadMeta(), loadWeather(), loadSimilar()])
      .then(([m, w, s]) => {
        setMeta(m); setWeather(w); setSimilar(s)
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
  // 目标日气象摘要（供相似日面板作选择参照）
  const targetWx = useMemo(() => {
    if (!dayWx || !dayWx.temp.length) return null
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0)
    return {
      temperature_2m_mean: sum(dayWx.temp) / dayWx.temp.length,
      temperature_2m_max: Math.max(...dayWx.temp),
      shortwave_radiation_mean: sum(dayWx.rad) / dayWx.rad.length,
      precipitation_sum: dayWx.prec ? sum(dayWx.prec) : 0,
    }
  }, [dayWx])
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

  // 区间质量：按所选模型全月 D1 实测（从 forecast 文件计算，PICP 名义 90%）
  const intervalQuality = useMemo(() => {
    if (!forecast) return null
    const actual: number[] = [], loA: number[] = [], hiA: number[] = []
    for (const day of Object.values(forecast)) {
      const d1 = (day as Record<string, DayForecast>)['1']
      if (!d1) continue
      actual.push(...d1.actual); loA.push(...d1.lower); hiA.push(...d1.upper)
    }
    if (!actual.length) return null
    let inband = 0
    for (let i = 0; i < actual.length; i++) if (actual[i] >= loA[i] && actual[i] <= hiA[i]) inband++
    const picp = inband / actual.length
    const mpiw = hiA.reduce((s, u, i) => s + (u - loA[i]), 0) / loA.length
    return { picp, mpiw }
  }, [forecast])

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
              2025-06 · D1-D14 · 全网负荷口径
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
              options={(meta?.models ?? []).map((m) => ({ value: m.id, label: m.name }))}
              width="w-[110px]"
            />
            <ToolbarSelect
              icon={<Timer className="h-3.5 w-3.5" />}
              label={<><span>提前期</span><InfoTip title="提前期 D1/D3/D7/D14">{INFO.days}</InfoTip></>}
              value={String(dayplus)} onValueChange={(v) => setDayplus(Number(v))}
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
              <Kpi label={<><span>区间覆盖率</span><InfoTip title="区间覆盖率 PICP">{INFO.picp}</InfoTip></>} value={`${kpis.cov.toFixed(0)}%`} sub="实际落入90%区间" />
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
            <div className="flex flex-col gap-3">
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
                    <span className="inline-flex items-center gap-1">
                      背景色带：夜谷 / 早峰 / 午谷 / 晚峰
                      <InfoTip title="夜谷 / 早峰 / 午谷 / 晚峰">{INFO.segs}</InfoTip>
                    </span>
                    · 浅蓝带：90% 预测区间
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
              <EffectPanel
                before={dayFc.center}
                after={adjusted}
                actual={dayFc.actual}
                segments={meta.segments}
                hasAdj={ops.length > 0 || !!previewOp}
                targetDay={targetDay}
                model={model}
                dayplus={dayplus}
              />
            </div>
            <SimilarPanel days={simDays} selected={simDay} onSelect={setSimDay} onApply={applySimilar}
              targetDay={targetDay} targetWeather={targetWx} />
          </div>

          {/* 下区 */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_360px]">
            <WeatherChart day={dayWx} date={targetDay} />
            <OpsLog ops={ops} savedAt={savedAt} onUndo={undo} onReset={reset} onSave={save} onExport={doExport} />
          </div>

          {/* 系统定位（页脚能力概述） */}
          <footer className="rounded-xl border border-border/60 bg-card/30 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            面向电力调度的负荷预测研判工作台：AI 全月预测底稿 · 多模型对比（LGB / TCN / HistGB / RF / ET / Linear）·
            相似日 / 气象 / 分时段人工修正 · 概率区间 · 操作回放与导出。
          </footer>
        </main>
      )}
    </div>
  )
}

function ToolbarSelect({ icon, label, value, onValueChange, options, width }: {
  icon: React.ReactNode; label: React.ReactNode; value: string;
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
  label: React.ReactNode; value: string; unit?: string; sub?: string
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
