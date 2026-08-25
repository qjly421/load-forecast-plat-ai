import { useMemo, useState } from 'react'
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ReferenceLine, Scatter, ResponsiveContainer, Cell,
} from 'recharts'
import { Gauge, Waves, Activity, AlertTriangle, ChevronDown } from 'lucide-react'
import { analyzePeriodicity } from '@/lib/spectral'
import type { ForecastFile } from '@/types/adjust'
import { InfoTip } from '@/components/ui/info-tip'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

// 深色主题统一色板
const C = {
  cyan: '#22d3ee',
  cyanSoft: 'hsl(187 90% 55%)',
  sky: '#38bdf8',
  amber: 'hsl(45 95% 60%)',
  violet: '#a78bfa',
  white: 'hsl(210 40% 88%)',
  rose: 'hsl(0 80% 62%)',
  grid: 'hsl(217 33% 15%)',
  axis: 'hsl(215 20% 58%)',
  tooltipBg: 'hsl(222 44% 10%)',
  tooltipBd: 'hsl(217 33% 20%)',
}
const TIP = {
  contentStyle: { background: C.tooltipBg, border: `1px solid ${C.tooltipBd}`, borderRadius: 8, fontSize: 12 },
  itemStyle: { color: '#e2e8f0' }, labelStyle: { color: '#94a3b8' },
}
const axisTick = { fontSize: 10, fill: C.axis }
const axisLine = { stroke: 'hsl(217 33% 18%)' }

// 异常图中各序列的 中文名 / 单位 / 颜色（tooltip 用）
const ANOM_NAME: Record<string, string> = { mean: '日均负荷', tempMax: '日最高温', jump: '突变关注', hot: '高温关注' }
const ANOM_UNIT: Record<string, string> = { mean: ' MW', tempMax: ' °C', jump: ' MW', hot: ' °C' }
const ANOM_COLOR: Record<string, string> = { mean: C.sky, tempMax: C.rose, jump: C.amber, hot: C.rose }

export interface DailyRow {
  date: string
  fullDate: string
  max: number
  min: number
  mean: number
  centerMax: number
  temp: number
  tempMax: number
  prec: number
}

interface Props {
  days: string[]
  fcLgb: ForecastFile
  daily: DailyRow[]
  /** 数据集名（如 "山东 / Shandong"）与测试月标签（如 "2025-06"），用于文案口径 */
  regionName?: string
  monthLabel?: string
  /** 山东才有「手动调整」工作台，非山东不提示进手动调整 */
  isSd?: boolean
}

/** 滑动窗口标准差（尾部窗口，长度与输入一致） */
function rollingStd(arr: number[], win: number): number[] {
  const out: number[] = new Array(arr.length).fill(0)
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]
    sumSq += arr[i] * arr[i]
    if (i >= win) {
      sum -= arr[i - win]
      sumSq -= arr[i - win] * arr[i - win]
    }
    const n = Math.min(i + 1, win)
    const mean = sum / n
    const varr = Math.max(0, sumSq / n - mean * mean)
    out[i] = Math.sqrt(varr)
  }
  return out
}

/** 谷峰结构 tooltip：逐日 峰谷差 / 负荷率 / 峰值时刻 / 峰值负荷 */
function ValleyPeakTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const row = payload[0]?.payload
  if (!row) return null
  return (
    <div style={{ ...TIP.contentStyle, color: C.white }}>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{row.fullDate ?? label}</div>
      <div>峰谷差：{row.diff.toLocaleString()} MW</div>
      <div>负荷率：{row.ratio.toFixed(1)}%</div>
      <div>峰值时刻：{row.peakTime}</div>
      <div>峰值负荷：{row.peakLoad.toLocaleString()} MW</div>
    </div>
  )
}

/** 异常 · 关注时段 tooltip：各序列值 + “为什么关注”说明 */
function AnomalyTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null
  const row = payload.find((p: any) => p.payload?.reason)?.payload ?? payload[0]?.payload
  if (!row) return null
  const vals = payload.filter((p: any) => p.value != null && p.value !== undefined)
  return (
    <div style={{ ...TIP.contentStyle, color: C.white }}>
      <div style={{ fontWeight: 600, marginBottom: 3 }}>{row.fullDate ?? label}</div>
      {vals.map((p: any, i: number) => (
        <div key={i} style={{ color: ANOM_COLOR[p.dataKey] ?? C.white }}>
          {ANOM_NAME[p.dataKey] ?? String(p.dataKey)}：{typeof p.value === 'number' ? p.value.toLocaleString() : p.value}{ANOM_UNIT[p.dataKey] ?? ''}
        </div>
      ))}
      {row.reason && (
        <div style={{ marginTop: 3, borderTop: `1px solid ${C.tooltipBd}`, paddingTop: 3, color: C.amber }}>
          关注原因：{row.reason}
        </div>
      )}
    </div>
  )
}

/**
 * 负荷时序特征分析 · 四视图
 * 谷峰结构（逐日峰谷差/负荷率/峰值时刻）/ 周期性（日内自相关 + 日内形态）/ 波动性（移动标准差）/ 异常关注时段（突变 + 高温）
 * 全部基于 2025-06 真实负荷与气温数据计算。
 */
export default function TimeseriesFeatures({ days, fcLgb, daily, regionName = '', monthLabel = '', isSd = false }: Props) {
  const [open, setOpen] = useState(true)
  // 异常/综述里提示去向：山东指向「手动调整」，其它数据集指向「爬坡预警」
  const adjHint = isSd ? '建议在「人机协同修正」中逐段复核' : '建议在「爬坡预警」中关注'

  // ---- 拼接 30 天 2880 点真实负荷序列（96 点/天，15 分钟采样） ----
  const series = useMemo(() => {
    const s: number[] = []
    for (const d of days) {
      const act = fcLgb[d]?.['1']?.actual
      if (act && act.length === 96) s.push(...act)
    }
    return s
  }, [days, fcLgb])

  // ---- 谷峰结构 · 日内调节幅度：逐日 峰谷差 / 负荷率 / 峰值时刻 ----
  const valleyPeak = useMemo(() => {
    if (!daily.length) return []
    const slots = 96
    return daily.map((d) => {
      const act = fcLgb[d.fullDate]?.['1']?.actual
      let peakSlot = -1
      let peakLoad = d.max
      if (act && act.length === slots) {
        let bi = 0
        for (let i = 1; i < slots; i++) if (act[i] > act[bi]) bi = i
        peakSlot = bi
        peakLoad = Math.round(act[bi])
      }
      const minutes = peakSlot >= 0 ? peakSlot * 15 : -1
      const hh = minutes >= 0 ? String(Math.floor(minutes / 60)).padStart(2, '0') : '--'
      const mm = minutes >= 0 ? String(minutes % 60).padStart(2, '0') : '--'
      const diff = d.max - d.min
      const ratio = d.max > 0 ? (d.mean / d.max) * 100 : 0
      return {
        date: d.date,
        fullDate: d.fullDate,
        diff,
        ratio: Math.round(ratio * 10) / 10,
        peakTime: `${hh}:${mm}`,
        peakHour: peakSlot >= 0 ? Math.floor(minutes / 60) : -1,
        peakLoad,
      }
    })
  }, [daily, fcLgb])

  // 谷峰结构结论（全部真实计算）
  const valleyPeakConcl = useMemo(() => {
    if (!valleyPeak.length) return ''
    const maxDiff = valleyPeak.reduce((a, b) => (b.diff > a.diff ? b : a))
    const minRatio = valleyPeak.reduce((a, b) => (b.ratio < a.ratio ? b : a))
    const hourCount = new Map<number, number>()
    for (const vp of valleyPeak) {
      if (vp.peakHour < 0) continue
      hourCount.set(vp.peakHour, (hourCount.get(vp.peakHour) ?? 0) + 1)
    }
    let modalHour = -1
    let modalCount = 0
    for (const [h, c] of hourCount) if (c > modalCount) { modalCount = c; modalHour = h }
    // 统计峰值时刻落在「峰时 ± 1h」窗口的天数，得出更贴近实际的集中区间
    const windowCount = modalHour >= 0
      ? valleyPeak.filter((vp) => vp.peakHour >= 0 && Math.abs(vp.peakHour - modalHour) <= 1).length
      : 0
    const modalText = modalHour >= 0
      ? `峰值时刻集中在 ~${modalHour} 时前后（${windowCount}/${valleyPeak.length} 天）`
      : '峰值时刻分布较分散'
    return `峰谷差最大出现在 ${maxDiff.date}（≈${maxDiff.diff.toLocaleString()} MW）；负荷率最低 ${minRatio.date}（≈${minRatio.ratio.toFixed(1)}%）；${modalText}。`
  }, [valleyPeak])

  // ---- 周期性：自相关峰值 + 日内均值形态 ----
  const spectralPeaks = useMemo(() => {
    if (series.length < 96 * 2) return null
    return analyzePeriodicity(series, 0.25)
  }, [series])

  const spectralChart = useMemo(() => {
    if (!spectralPeaks) return []
    return spectralPeaks.map((p) => ({
      name: periodName(p.periodHours),
      hours: Math.round(p.periodHours),
      corr: Math.round(p.correlation * 1000) / 1000,
    }))
  }, [spectralPeaks])

  const spectralConclusion = useMemo(() => {
    if (!spectralPeaks) return '未检测到显著周期。'
    const p24 = spectralPeaks.find((p) => Math.abs(p.periodHours - 24) < 1)
    const p12 = spectralPeaks.find((p) => Math.abs(p.periodHours - 12) < 1)
    const p168 = spectralPeaks.find((p) => Math.abs(p.periodHours - 168) < 2)
    const strong = (c: number) => c >= 0.3
    if (!p24) return '未检测到显著周期。'
    let s = `负荷呈现明显的 24 小时日周期（r≈${p24.correlation.toFixed(2)}），为绝对主导分量。`
    if (p12 && strong(p12.correlation)) s += ` 叠加 12 小时半日双峰（r≈${p12.correlation.toFixed(2)}）。`
    else if (p12) s += ` 12 小时半日分量较弱（r≈${p12.correlation.toFixed(2)}）。`
    if (p168 && strong(p168.correlation)) s += ` 周周期明显（r≈${p168.correlation.toFixed(2)}）。`
    else if (p168) s += ` 168 小时周周期较弱（r≈${p168.correlation.toFixed(2)}）。`
    return s
  }, [spectralPeaks])

  // 日内均值形态：30 天同一 slot 取均值 → 96 点
  const intradayShape = useMemo(() => {
    if (!days.length || !fcLgb) return []
    const slots = 96
    const sumArr = new Array(slots).fill(0)
    const cnt = new Array(slots).fill(0)
    for (const d of days) {
      const act = fcLgb[d]?.['1']?.actual
      if (!act || act.length !== slots) continue
      for (let i = 0; i < slots; i++) {
        sumArr[i] += act[i]
        cnt[i]++
      }
    }
    return sumArr.map((s, i) => ({
      hour: i / 4, // 96 点 / 24h = 4 点每小时
      v: cnt[i] ? Math.round(s / cnt[i]) : 0,
    }))
  }, [days, fcLgb])

  // 日内负荷峰（形态直观结论）
  const shapePeak = useMemo(() => {
    if (!intradayShape.length) return null
    let best = intradayShape[0]
    for (const p of intradayShape) if (p.v > best.v) best = p
    return best
  }, [intradayShape])

  // ---- 波动性：移动标准差（窗口 = 1 天 = 96 点），按日聚合 ----
  const volatility = useMemo(() => {
    if (series.length === 0) return []
    const std = rollingStd(series, 96)
    const rows = daily.map((d, di) => {
      let s = 0
      const seg = std.slice(di * 96, di * 96 + 96)
      for (const v of seg) s += v
      return { date: d.date, d: Math.round(s / seg.length) }
    })
    return rows
  }, [series, daily])

  const volMax = useMemo(() => {
    if (!volatility.length) return null
    return volatility.reduce((a, b) => (b.d > a.d ? b : a))
  }, [volatility])

  const volMean = useMemo(() => {
    if (!volatility.length) return 0
    return Math.round(volatility.reduce((a, b) => a + b.d, 0) / volatility.length)
  }, [volatility])

  // ---- 异常 · 关注时段：逐日突变幅度 + 高温日（附“为什么关注”理由） ----
  const anomaly = useMemo(() => {
    if (!daily.length) return []
    const changes = daily.map((d, i) => {
      const prev = i > 0 ? daily[i - 1].mean : d.mean
      return { date: d.date, fullDate: d.fullDate, mean: d.mean, tempMax: d.tempMax, change: Math.abs(d.mean - prev) }
    })
    const chVals = changes.map((c) => c.change)
    const chMean = chVals.reduce((a, b) => a + b, 0) / chVals.length
    const chStd = Math.sqrt(chVals.reduce((a, b) => a + (b - chMean) ** 2, 0) / chVals.length)
    const chThr = chMean + chStd

    const tempSorted = [...daily].sort((a, b) => b.tempMax - a.tempMax)
    const rankMap = new Map<string, number>()
    tempSorted.forEach((d, i) => rankMap.set(d.fullDate, i + 1))

    return changes.map((c) => {
      const isJump = c.change >= chThr
      const rank = rankMap.get(c.fullDate) ?? 0
      const isHot = rank <= 3
      const reasons: string[] = []
      if (isJump) reasons.push(`日均负荷较前日跳变 +${c.change.toFixed(0)} MW，超过统计阈值 ${chThr.toFixed(0)} MW`)
      if (isHot) reasons.push(`日最高温 ${c.tempMax}°C，位居全月第 ${rank} 高`)
      return {
        ...c,
        // 突变关注点直接落在当日负荷曲线上（左轴），高温关注点落在气温曲线上（右轴）
        jump: isJump ? c.mean : null,
        hot: isHot ? c.tempMax : null,
        reason: reasons.join('；'),
      }
    })
  }, [daily])

  const anomalyCount = useMemo(() => anomaly.filter((a) => a.jump !== null || a.hot !== null).length, [anomaly])

  // ---- 底部综述：把四块结论串成一句 ----
  const summary = useMemo(() => {
    if (!spectralPeaks || !volMax) return ''
    const p24 = spectralPeaks.find((p) => Math.abs(p.periodHours - 24) < 1)
    const s1 = `负荷呈${p24 ? `强 24h 日周期（r≈${p24.correlation.toFixed(2)}）` : '周期性'}，`
    const s2 = shapePeak
      ? (() => {
          const pk = Math.round(shapePeak.hour)
          const pd = pk < 6 ? '凌晨' : pk < 11 ? '上午' : pk < 14 ? '中午' : pk < 18 ? '下午' : '晚间'
          return `日内负荷峰出现在${pd} ~${pk} 时（均值 ${shapePeak.v.toLocaleString()} MW），`
        })()
      : ''
    const s3 = `波动在 ${volMax.date} 前后偏强（移动标准差 ≈ ${volMax.d} MW，月均 ${volMean} MW）；`
    const s4 = anomalyCount > 0
      ? `共标记 ${anomalyCount} 个关注时段，${adjHint}。`
      : '未检出突出关注时段。'
    return `${s1}${s2}${s3}${s4}`
  }, [spectralPeaks, shapePeak, volMax, volMean, anomalyCount])

  // 波动性是否整体偏高（用于无异常时的中性表述）
  const volRatio = volMean > 0 && volMax ? (volMax.d / volMean).toFixed(2) : '--'

  return (
    <div className="card-glow rounded-xl p-4">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Activity className="h-3.5 w-3.5 text-cyan-400" />
              <span>负荷时序特征分析</span>
            </h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              「谷峰 / 周期性 / 波动性 / 异常」四视图 · {regionName}{monthLabel ? ` ${monthLabel}` : ''} 真实负荷与气温计算
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')} />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {/* 1 · 谷峰结构 · 日内调节幅度 */}
            <SubCard title="谷峰结构 · 日内调节幅度" subtitle="逐日 峰谷差 & 负荷率 · 反映日内调峰空间" icon={<Gauge className="h-3.5 w-3.5 text-cyan-400" />}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={valleyPeak} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={axisLine} interval={1} />
                    <YAxis yAxisId="l" tick={axisTick} tickLine={false} axisLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={40}
                      domain={[0, 'dataMax']} />
                    <YAxis yAxisId="r" orientation="right" domain={[0, 100]} unit="%" tick={axisTick} tickLine={false} axisLine={false} width={40} />
                    <Tooltip {...TIP} content={ValleyPeakTooltip} cursor={{ fill: C.grid, fillOpacity: 0.3 }} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 2 }}
                      formatter={(v: string) => <span style={{ color: C.axis }}>{v}</span>} />
                    <Bar yAxisId="l" dataKey="diff" name="峰谷差" fill={C.cyan} fillOpacity={0.35} radius={[3, 3, 0, 0]} barSize={10} />
                    <Line yAxisId="r" dataKey="ratio" name="负荷率" type="monotone" stroke={C.amber} strokeWidth={1.8} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{valleyPeakConcl}</p>
            </SubCard>

            {/* 2 · 周期性 */}
            <SubCard title="日内周期性 · 自相关" subtitle="24h 主导 · 自相关峰值 + 日内平均荷形" icon={<Waves className="h-3.5 w-3.5 text-cyan-400" />}>
              <div style={{ height: 74 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={spectralChart} margin={{ top: 6, right: 6, bottom: 0, left: -14 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 1]} tick={axisTick} tickLine={false} axisLine={false} width={34} />
                    <Tooltip {...TIP} formatter={(v: number) => [`r = ${v}`, '自相关系数']} />
                    <Bar dataKey="corr" radius={[4, 4, 0, 0]} barSize={40}>
                      {spectralChart.map((r, i) => (
                        <Cell key={i} fill={r.hours === 24 ? C.cyan : r.hours === 12 ? C.amber : C.violet} />
                      ))}
                    </Bar>
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div style={{ height: 92 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={intradayShape} margin={{ top: 6, right: 8, bottom: 0, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="hour" type="number" domain={[0, 24]} ticks={[0, 6, 12, 18, 24]} tick={axisTick} tickLine={false} axisLine={false}
                      tickFormatter={(v: number) => `${v}时`} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={34} domain={['dataMin', 'dataMax']} />
                    <Tooltip {...TIP}
                      formatter={(v: number) => [`${v.toLocaleString()} MW`, '日内均负荷']}
                      labelFormatter={(l: number) => `${l} 时`} />
                    <Area dataKey="v" stroke={C.cyanSoft} strokeWidth={1.8} fill={C.cyan} fillOpacity={0.12} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{spectralConclusion}</p>
            </SubCard>

            {/* 3 · 波动性 */}
            <SubCard title="负荷波动性 · 移动标准差" subtitle="窗口 = 1 天（96 点）· 反映数据稳定性" icon={<Activity className="h-3.5 w-3.5 text-violet-400" />}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={volatility} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={axisLine} interval={1} />
                    <YAxis tick={axisTick} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${v}`} width={44}
                      domain={[0, 'dataMax + 500']} />
                    <Tooltip {...TIP} formatter={(v: number) => [`${v.toLocaleString()} MW`, '移动标准差']} />
                    <ReferenceLine y={volMean} stroke={C.amber} strokeDasharray="5 4"
                      label={{ value: `月均 ${volMean}`, position: 'insideTopRight', fill: C.amber, fontSize: 10 }} />
                    <Area dataKey="d" type="monotone" stroke={C.violet} strokeWidth={1.8} fill={C.violet} fillOpacity={0.14} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {volMax
                  ? `1 天窗口移动标准差峰值出现在 ${volMax.date}（≈ ${volMax.d} MW），为月均值（${volMean} MW）的 ${volRatio} 倍，波动偏强时段可在人机协同修正中复核。`
                  : '月份内波动整体平稳。'}
              </p>
            </SubCard>

            {/* 4 · 异常· 关注时段 */}
            <SubCard title="异常变化 · 关注时段" subtitle="逐日突变幅度 + 高温日 · 复核改善" icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
              info={<InfoTip title="异常关注判定规则">突变关注 = 某日日均负荷较前一日跳变超过历史均值+1σ；高温关注 = 日最高温位居全月前 3 高，推升制冷负荷。</InfoTip>}>
              <div style={{ height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={anomaly} margin={{ top: 8, right: 6, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                    <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={axisLine} interval={1} />
                    <YAxis yAxisId="l" domain={['dataMin - 2000', 'dataMax + 2000']} tick={axisTick} tickLine={false} axisLine={false}
                      tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} width={40} />
                    <YAxis yAxisId="t" orientation="right" domain={[15, 40]} tick={axisTick} tickLine={false} axisLine={false}
                      unit="°" width={32} />
                    <Tooltip {...TIP} content={AnomalyTooltip} cursor={{ stroke: C.axis, strokeOpacity: 0.4 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v: string) =>
                      <span style={{ color: C.axis }}>{ANOM_NAME[v] ?? v}</span>} />
                    <Line yAxisId="l" dataKey="mean" type="monotone" stroke={C.sky} strokeWidth={1.6} dot={false} />
                    <Line yAxisId="t" dataKey="tempMax" type="monotone" stroke={C.rose} strokeWidth={1.1} strokeDasharray="4 3" dot={false} />
                    <Scatter yAxisId="l" dataKey="jump" fill={C.amber} name="突变关注" />
                    <Scatter yAxisId="t" dataKey="hot" fill={C.rose} name="高温关注" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                标注 {anomalyCount} 个关注时段（{anomaly.filter((a) => a.jump !== null).length} 个突变点 ·
                {anomaly.filter((a) => a.hot !== null).length} 个高温日），{adjHint}。
              </p>
            </SubCard>
          </div>

          {/* 底部综述 */}
          {summary && (
            <p className="mt-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2 text-[11px] leading-relaxed text-foreground/90">
              综述：{summary}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

/** 子图卡片：统一标题 / 副标题 / 内容（可选 ⓘ 说明） */
function SubCard({ title, subtitle, icon, info, children }: {
  title: string; subtitle: string; icon: React.ReactNode; info?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className={cn('card-glow rounded-xl p-3')}>
      <div className="mb-1 flex items-center gap-1.5">
        {icon}
        <h4 className="text-[13px] font-semibold">{title}</h4>
        {info}
      </div>
      <p className="mb-1 text-[10px] text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  )
}

/** 周期时长 -> 中文标签 */
function periodName(h: number): string {
  if (Math.abs(h - 168) < 2) return '168h（周）'
  if (Math.abs(h - 24) < 1) return '24h（日）'
  if (Math.abs(h - 12) < 1) return '12h（半日）'
  if (Math.abs(h - 8) < 1) return '8h'
  return `${Math.round(h)}h`
}
