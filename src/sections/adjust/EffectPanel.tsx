import { useMemo } from 'react'
import { Gauge, TrendingUp, TrendingDown, Minus, ArrowDownRight, ArrowUpRight } from 'lucide-react'
import type { SegmentDef } from '@/types/adjust'
import { mape } from '@/lib/adjust-engine'
import { cn } from '@/lib/utils'

interface EffectPanelProps {
  before: number[]          // 原始预测（dayFc.center）
  after: number[]           // 调整后预测（applyOps 结果）
  actual: number[]
  segments: SegmentDef[]
  hasAdj: boolean           // 是否已做任何调整
  targetDay: string
  model: string
  dayplus: number
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
function rmse(a: number[]) {
  return Math.sqrt(mean(a.map((v) => v * v)))
}
function mapeSub(pred: number[], actual: number[], range: [number, number][]) {
  const idx: number[] = []
  for (const [a, b] of range) for (let i = a; i <= b && i < 96; i++) idx.push(i)
  if (!idx.length) return null
  const ps = idx.map((i) => pred[i])
  const as = idx.map((i) => actual[i])
  return mape(ps, as)
}

export default function EffectPanel({ before, after, actual, segments, hasAdj, targetDay, model, dayplus }: EffectPanelProps) {
  const stat = useMemo(() => {
    const bM = mape(before, actual)
    const aM = mape(after, actual)
    const delta = aM - bM
    const rel = bM > 0 ? (delta / bM) * 100 : 0
    return {
      beforeMape: bM,
      afterMape: aM,
      delta,
      rel,
      beforeRmse: rmse(before.map((v, i) => v - actual[i])),
      afterRmse: rmse(after.map((v, i) => v - actual[i])),
      beforePeak: (Math.max(...before.map((v, i) => Math.abs(v - actual[i]))) / (Math.max(...actual) || 1)) * 100,
      afterPeak: (Math.max(...after.map((v, i) => Math.abs(v - actual[i]))) / (Math.max(...actual) || 1)) * 100,
    }
  }, [before, after, actual])

  const verdict = useMemo(() => {
    if (!hasAdj) return { key: 'none' as const, label: '尚未调整', cls: 'text-muted-foreground' }
    if (stat.delta < -0.05) return { key: 'good' as const, label: '改善', cls: 'text-emerald-300' }
    if (stat.delta > 0.05) return { key: 'bad' as const, label: '变差', cls: 'text-red-300' }
    return { key: 'flat' as const, label: '基本持平', cls: 'text-muted-foreground' }
  }, [hasAdj, stat.delta])

  const SegIcon = (key: string) =>
    key === 'good' ? TrendingDown :
    key === 'bad' ? TrendingUp : Minus

  const segRows = useMemo(
    () =>
      segments.map((s) => {
        const pb = mapeSub(before, actual, s.ranges)
        const pa = mapeSub(after, actual, s.ranges)
        const d = pa != null && pb != null ? pa - pb : 0
        const key = d < -0.1 ? 'good' : d > 0.1 ? 'bad' : 'flat'
        return { s, pb, pa, d, key }
      }),
    [segments, before, after, actual],
  )

  return (
    <div className="card-glow flex flex-1 flex-col rounded-xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold">调整效果</h3>
        </div>
        <span className={cn('flex items-center gap-1 text-[11px] font-semibold', verdict.cls)}>
          {(() => { const I = SegIcon(verdict.key); return <I className="h-3.5 w-3.5" /> })()}
          {verdict.label}
        </span>
      </div>

      {hasAdj ? (
        <>
          <div className="rounded-lg border border-border/60 bg-card/30 p-3">
            <div className="text-[10px] text-muted-foreground">平均相对误差（MAPE · 越低越好）</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-[15px] font-bold text-muted-foreground/70">{stat.beforeMape.toFixed(2)}%</span>
              <span className="text-muted-foreground">→</span>
              <span className={cn('font-mono text-[20px] font-bold', stat.delta < -0.05 ? 'text-emerald-300' : stat.delta > 0.05 ? 'text-red-300' : 'text-foreground')}>
                {stat.afterMape.toFixed(2)}%
              </span>
              <span className={cn('ml-auto flex items-center gap-0.5 font-mono text-[13px] font-semibold', stat.delta < -0.05 ? 'text-emerald-300' : stat.delta > 0.05 ? 'text-red-300' : 'text-muted-foreground')}>
                {stat.delta < -0.05 ? <ArrowDownRight className="h-3.5 w-3.5" /> : stat.delta > 0.05 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                {stat.rel >= 0 ? '+' : ''}{stat.rel.toFixed(1)}% 相对原始
              </span>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <MiniStat label="RMSE（MW）" before={stat.beforeRmse} after={stat.afterRmse} />
            <MiniStat label="峰值误差（%）" before={stat.beforePeak} after={stat.afterPeak} />
          </div>

          <div className="mt-2 flex-1 space-y-1 text-[10px]">
            <div className="flex items-center justify-between px-1 text-muted-foreground">
              <span>分时段 MAPE</span>
              <span className="font-mono">调整前 → 调整后</span>
            </div>
            {segRows.map(({ s, pb, pa, key }) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border/50 bg-secondary/30 px-2 py-1.5">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className={cn('text-[10px] font-semibold', key === 'good' ? 'text-emerald-300' : key === 'bad' ? 'text-red-300' : 'text-muted-foreground')}>{s.name}</span>
                  <span className="text-[9px] text-muted-foreground/70">{s.hours}</span>
                </span>
                <span className="font-mono">
                  {pb != null && pa != null ? (
                    <>
                      <span className="text-muted-foreground/70">{pb.toFixed(2)}%</span>
                      <span className="mx-1 text-muted-foreground/50">→</span>
                      <span className={cn('font-semibold', key === 'good' ? 'text-emerald-300' : key === 'bad' ? 'text-red-300' : 'text-foreground')}>{pa.toFixed(2)}%</span>
                    </>
                  ) : '—'}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <div className="text-[11px] text-muted-foreground">
            对 <span className="font-mono text-foreground">{targetDay}</span>{' '}
            <span className="font-mono text-foreground">{model.toUpperCase()} · D{dayplus}</span> 做操作后，
            这里会量化每次调整对预测精度的改善 / 变差程度。
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground/70">调整前 MAPE {stat.beforeMape.toFixed(2)}%（以此为基线对比）</div>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before
  const key = delta < -0.05 ? 'good' : delta > 0.05 ? 'bad' : 'flat'
  return (
    <div className="rounded-lg border border-border/50 bg-card/30 px-2.5 py-1.5">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1.5 font-mono text-[12px] font-semibold">
        <span className="text-muted-foreground/70">{before.toFixed(1)}</span>
        <span className="text-muted-foreground/50">→</span>
        <span className={key === 'good' ? 'text-emerald-300' : key === 'bad' ? 'text-red-300' : 'text-foreground'}>{after.toFixed(1)}</span>
        <span className={cn('ml-auto text-[10px]', key === 'good' ? 'text-emerald-300' : key === 'bad' ? 'text-red-300' : 'text-muted-foreground')}>
          {delta < -0.05 ? '↓' : delta > 0.05 ? '↑' : '—'}
        </span>
      </div>
    </div>
  )
}
