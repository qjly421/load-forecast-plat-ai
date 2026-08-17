import { useMemo } from 'react'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CloudSun } from 'lucide-react'
import type { WeatherDay } from '@/types/adjust'
import { slotTime } from '@/lib/adjust-engine'

interface WeatherChartProps {
  day: WeatherDay
  date: string
}

export default function WeatherChart({ day, date }: WeatherChartProps) {
  const data = useMemo(
    () =>
      day.temp.map((_, i) => ({
        slot: i,
        temp: day.temp[i],
        atemp: day.atemp[i],
        rad: day.rad[i],
        prec: day.prec[i],
      })),
    [day],
  )

  const tMax = Math.max(...day.temp)
  const tMin = Math.min(...day.temp)
  const precSum = day.prec.reduce((s, v) => s + v, 0)

  return (
    <div className="card-glow rounded-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CloudSun className="h-4 w-4 text-orange-400" />
          <h3 className="text-sm font-semibold">气象趋势</h3>
          <span className="font-mono text-[11px] text-muted-foreground">{date}</span>
        </div>
        <div className="flex gap-2 text-[10px] text-muted-foreground">
          <span>
            气温 <b className="text-orange-300">{tMin.toFixed(0)}~{tMax.toFixed(0)}°C</b>
          </span>
          <span>
            降水 <b className="text-sky-300">{precSum.toFixed(1)}mm</b>
          </span>
        </div>
      </div>
      <div style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 15%)" vertical={false} />
            <XAxis
              dataKey="slot"
              tick={{ fontSize: 10, fill: 'hsl(215 20% 58%)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(s: number) => (s % 16 === 0 ? slotTime(s) : '')}
              interval={0}
            />
            <YAxis
              yAxisId="t"
              tick={{ fontSize: 10, fill: 'hsl(25 90% 60%)' }}
              tickLine={false}
              axisLine={false}
              unit="°"
              width={32}
            />
            <YAxis
              yAxisId="r"
              orientation="right"
              tick={{ fontSize: 10, fill: 'hsl(50 90% 55%)' }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(222 44% 10%)',
                border: '1px solid hsl(217 33% 20%)',
                borderRadius: 8,
                fontSize: 11,
              }}
              labelFormatter={(s: number) => slotTime(Number(s))}
              formatter={(v: number, name: string) => {
                const map: Record<string, [string, string]> = {
                  temp: ['气温', '°C'],
                  atemp: ['体感温度', '°C'],
                  rad: ['短波辐射', ' W/m²'],
                  prec: ['降水', ' mm'],
                }
                const [label, unit] = map[name] ?? [name, '']
                return [`${v}${unit}`, label]
              }}
            />
            <Area
              yAxisId="r"
              dataKey="rad"
              stroke="none"
              fill="hsl(50 90% 55%)"
              fillOpacity={0.15}
              tooltipType="none"
              isAnimationActive={false}
            />
            <Line yAxisId="t" type="monotone" dataKey="temp" stroke="hsl(25 90% 60%)" strokeWidth={1.6} dot={false} />
            <Line
              yAxisId="t"
              type="monotone"
              dataKey="atemp"
              stroke="hsl(0 80% 62%)"
              strokeWidth={1.2}
              strokeDasharray="4 3"
              dot={false}
            />
            <Line yAxisId="r" type="monotone" dataKey="prec" stroke="hsl(200 90% 60%)" strokeWidth={1.2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex justify-center gap-4 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-orange-400" />气温</span>
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-red-400" />体感温度</span>
        <span className="flex items-center gap-1"><i className="h-2 w-3 bg-yellow-400/30" />短波辐射</span>
        <span className="flex items-center gap-1"><i className="h-0.5 w-3 bg-sky-400" />降水</span>
      </div>
    </div>
  )
}
