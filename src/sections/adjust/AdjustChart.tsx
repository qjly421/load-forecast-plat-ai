import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
} from 'recharts'
import type { DayForecast, SegmentDef, SimilarDay, WeatherDay } from '@/types/adjust'
import { slotTime, fmtMw } from '@/lib/adjust-engine'

interface AdjustChartProps {
  forecast: DayForecast
  adjusted: number[]
  segments: SegmentDef[]
  similar: SimilarDay | null
  historyDay: WeatherDay | null // 目标日前一天
  showActual: boolean
  showHistory: boolean
  keypointMode: boolean
  keypoints: { slot: number; value: number }[]
  onChartClick: (slot: number) => void
}

const SEG_COLORS: Record<string, string> = {
  night: 'hsl(230 60% 30% / 0.14)',
  morning: 'hsl(45 90% 50% / 0.07)',
  midday: 'hsl(187 90% 45% / 0.06)',
  evening: 'hsl(0 80% 55% / 0.07)',
}

export default function AdjustChart({
  forecast,
  adjusted,
  segments,
  similar,
  historyDay,
  showActual,
  showHistory,
  keypointMode,
  keypoints,
  onChartClick,
}: AdjustChartProps) {
  const data = useMemo(
    () =>
      forecast.center.map((_, i) => ({
        slot: i,
        time: slotTime(i),
        actual: forecast.actual[i],
        center: forecast.center[i],
        lower: forecast.lower[i],
        upper: forecast.upper[i],
        adjusted: Math.round(adjusted[i]),
        similar: similar ? similar.daily_load[i] : null,
        history: showHistory && historyDay ? historyDay.load[i] : null,
      })),
    [forecast, adjusted, similar, historyDay, showHistory],
  )

  const kpMap = useMemo(() => new Map(keypoints.map((p) => [p.slot, p.value])), [keypoints])

  return (
    <div className="relative" style={{ height: 460 }}>
      {keypointMode && (
        <div className="absolute left-1/2 top-1 z-10 -translate-x-1/2 rounded-md border border-amber-400/50 bg-amber-400/15 px-3 py-1 text-xs font-medium text-amber-300">
          关键点模式：点击曲线添加 / 再点删除关键点，在左侧面板调整数值后应用
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 24, right: 16, bottom: 0, left: 8 }}
          onClick={(state) => {
            if (!keypointMode) return
            const label = (state as { activeLabel?: string | number })?.activeLabel
            if (label != null) onChartClick(Number(label))
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
          <XAxis
            dataKey="slot"
            tick={{ fontSize: 11, fill: 'hsl(215 20% 58%)' }}
            tickLine={false}
            axisLine={{ stroke: 'hsl(217 33% 18%)' }}
            tickFormatter={(s: number) => (s % 8 === 0 ? slotTime(s) : '')}
            interval={0}
          />
          <YAxis
            domain={['dataMin - 1200', 'dataMax + 1200']}
            tick={{ fontSize: 11, fill: 'hsl(215 20% 58%)' }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
            width={46}
          />
          <Tooltip
            contentStyle={{
              background: 'hsl(222 44% 10%)',
              border: '1px solid hsl(217 33% 20%)',
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={(s: number) => `时刻 ${slotTime(Number(s))}（slot ${s}）`}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                actual: '实际负荷',
                center: '原始预测',
                adjusted: '调整后预测',
                upper: '区间上限',
                lower: '区间下限',
                similar: similar ? `相似日 ${similar.date}` : '相似日',
                history: '前一日实际',
              }
              return [value != null ? `${fmtMw(value)} MW` : '—', labels[name] ?? name]
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 6 }}
            formatter={(value: string) => {
              const labels: Record<string, string> = {
                actual: '实际负荷',
                center: '原始预测（中心）',
                adjusted: '调整后预测',
                similar: similar ? `相似日 ${similar.date}` : '相似日',
                history: '前一日实际',
              }
              return <span style={{ color: 'hsl(215 20% 70%)' }}>{labels[value] ?? value}</span>
            }}
          />

          {/* 时段背景 */}
          {segments.map((seg) =>
            seg.ranges.map(([a, b]) => (
              <ReferenceArea
                key={`${seg.id}-${a}`}
                x1={a}
                x2={b}
                fill={SEG_COLORS[seg.id]}
                fillOpacity={1}
                strokeOpacity={0}
                ifOverflow="extendDomain"
              />
            )),
          )}

          {/* 90% 预测区间带 */}
          <Area
            dataKey="upper"
            stroke="none"
            fill="#38bdf8"
            fillOpacity={0.13}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Area
            dataKey="lower"
            stroke="none"
            fill="hsl(222 47% 8.5%)"
            fillOpacity={1}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />

          {/* 前一日实际（参考） */}
          {showHistory && (
            <Line
              type="monotone"
              dataKey="history"
              stroke="hsl(215 20% 45%)"
              strokeWidth={1.1}
              strokeDasharray="2 3"
              dot={false}
            />
          )}

          {/* 实际负荷 */}
          {showActual && (
            <Line
              type="monotone"
              dataKey="actual"
              stroke="hsl(210 40% 88%)"
              strokeWidth={1.8}
              dot={false}
            />
          )}

          {/* 相似日 */}
          {similar && (
            <Line
              type="monotone"
              dataKey="similar"
              stroke="#a78bfa"
              strokeWidth={1.4}
              strokeDasharray="8 4"
              dot={false}
              strokeOpacity={0.85}
            />
          )}

          {/* 原始预测 */}
          <Line
            type="monotone"
            dataKey="center"
            stroke="hsl(215 20% 55%)"
            strokeWidth={1.6}
            strokeDasharray="6 4"
            dot={false}
          />

          {/* 调整后预测 */}
          <Line
            type="monotone"
            dataKey="adjusted"
            stroke="#22d3ee"
            strokeWidth={2.6}
            dot={false}
            isAnimationActive={false}
          />

          {/* 关键点标记 */}
          {keypoints.map((p) => (
            <ReferenceDot
              key={p.slot}
              x={p.slot}
              y={p.value}
              r={5}
              fill="#f59e0b"
              stroke="hsl(222 47% 6%)"
              strokeWidth={2}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {kpMap.size > 0 && (
        <div className="absolute bottom-9 right-4 rounded border border-border bg-card/90 px-2 py-1 text-[10px] text-muted-foreground">
          已标记 {kpMap.size} 个关键点
        </div>
      )}
    </div>
  )
}
