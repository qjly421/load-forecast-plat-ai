import { useState } from 'react'
import { History, Blend, Thermometer, Sun, CloudRain } from 'lucide-react'
import type { SimilarDay } from '@/types/adjust'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { InfoTip } from '@/components/ui/info-tip'
import { cn } from '@/lib/utils'

/** 指标解释文案（ⓘ tooltip 用） */
const INFO = {
  similar: '历史上与目标日「负荷形状 + 天气」最接近的若干天，可参考其走势，用相似日形状修正当天预测。',
}

interface SimilarPanelProps {
  days: SimilarDay[]
  selected: SimilarDay | null
  onSelect: (d: SimilarDay | null) => void
  onApply: (d: SimilarDay, blend: number) => void
}

const DOW_CN: Record<string, string> = {
  Monday: '周一', Tuesday: '周二', Wednesday: '周三', Thursday: '周四',
  Friday: '周五', Saturday: '周六', Sunday: '周日',
}

export default function SimilarPanel({ days, selected, onSelect, onApply }: SimilarPanelProps) {
  const [blend, setBlend] = useState(50)

  return (
    <div className="card-glow flex h-full flex-col rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <History className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-semibold">TopK 相似期</h3>
          <InfoTip title="相似日 / TopK相似期">{INFO.similar}</InfoTip>
        </div>
        <span className="text-[10px] text-muted-foreground">DTW负荷 0.6 + 天气 0.4</span>
      </div>

      <div className="space-y-1.5">
        {days.map((d) => {
          const active = selected?.date === d.date
          const ws = d.weather_summary
          return (
            <button
              key={d.date}
              onClick={() => onSelect(active ? null : d)}
              className={cn(
                'w-full rounded-lg border p-2.5 text-left transition-all',
                active
                  ? 'border-violet-400/60 bg-violet-400/10 ring-1 ring-violet-400/30'
                  : 'border-border bg-secondary/40 hover:border-muted-foreground/40',
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold',
                      d.rank === 1 ? 'bg-amber-400/20 text-amber-300' : 'bg-secondary text-muted-foreground',
                    )}
                  >
                    {d.rank}
                  </span>
                  <span className="font-mono text-xs font-semibold">{d.date}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {DOW_CN[d.day_of_week] ?? d.day_of_week}
                    {d.is_weekend && <span className="ml-1 text-violet-300">周末</span>}
                  </span>
                </div>
                <span className={cn('font-mono text-xs font-bold', active ? 'text-violet-300' : 'text-muted-foreground')}>
                  {(d.similarity_score * 100).toFixed(1)}%
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Thermometer className="h-3 w-3 text-orange-400" />
                  {ws.temperature_2m_mean?.toFixed(1)}°C
                </span>
                <span className="flex items-center gap-0.5">
                  <Sun className="h-3 w-3 text-yellow-400" />
                  {Math.round(ws.shortwave_radiation_mean ?? 0)}W
                </span>
                <span className="flex items-center gap-0.5">
                  <CloudRain className="h-3 w-3 text-sky-400" />
                  {(ws.precipitation_sum ?? 0).toFixed(1)}mm
                </span>
                <span className="ml-auto">负荷距离 {d.load_distance.toFixed(3)}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* 形状迁移 */}
      <div className="mt-auto pt-3">
        <div className="rounded-lg border border-border bg-secondary/40 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Blend className="h-3.5 w-3.5 text-violet-400" />
            按相似日形状修正
          </div>
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>混入比例</span>
            <span className="font-mono font-semibold text-violet-300">{blend}%</span>
          </div>
          <Slider value={[blend]} onValueChange={([v]) => setBlend(v)} min={10} max={100} step={10} />
          <Button
            size="sm"
            className="mt-2.5 h-7 w-full text-xs"
            variant={selected ? 'default' : 'outline'}
            disabled={!selected}
            onClick={() => selected && onApply(selected, blend / 100)}
          >
            {selected ? `应用 ${selected.date} 的形状` : '先选择上方相似日'}
          </Button>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            将相似日曲线按当日均值缩放后，按比例混入当前预测。
          </p>
        </div>
      </div>
    </div>
  )
}
