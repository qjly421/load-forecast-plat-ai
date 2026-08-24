import { useMemo } from 'react'
import { Gauge, TrendingDown, TrendingUp, Minus, ArrowDownRight, ArrowUpRight } from 'lucide-react'
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
type VerdictKey = 'good' | 'bad' | 'flat' | 'none'
const VERDICT_CLS: Record<VerdictKey, string> = {
  good: 'text-emerald-300',
  bad: 'text-red-300',
  flat: 'text-muted-foreground',
  none: 'text-muted-foreground',
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

  const verdict = useMemo<VerdictKey>(() => {
    if (!hasAdj) return 'none'
    if (stat.delta < -0.05) return 'good'
    if (stat.delta > 0.05) return 'bad'
    return 'flat'
  }, [hasAdj, stat.delta])
  const verdictLabel = { good: '改善', bad: '变差', flat: '基本持平', none: '未调整' }[verdict]

  const segRows = useMemo(
    () =>
      segments.map((s) => {
        const pb = mapeSub(before, actual, s.ranges)
        const pa = mapeSub(after, actual, s.ranges)
        const d = pa != null && pb != null ? pa - pb : 0
        const key: VerdictKey = d < -0.1 ? 'good' : d > 0.1 ? 'bad' : 'flat'
        return { s, pb, pa, key, showLabel: d < -0.1 || d > 0.1 }
      }),
    [segments, before, after, actual],
  )

  const SegIcon = (k: VerdictKey) => (k === 'good' ? TrendingDown : k === 'bad' ? TrendingUp : Minus)
  const relCls = stat.delta < -0.05 ? 'text-emerald-300' : stat.delta > 0.05 ? 'text-red-300' : 'text-muted-foreground'
  const relIcon = stat.delta < -0.05 ? <ArrowDownRight className="h-3.5 w-3.5" /> : stat.delta > 0.05 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />

  return (
    <div className="card-glow rounded-xl p-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-1.5">
          <Gauge className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold">调整效果</h3>
        </div>

        {hasAdj ? (
          <>
            {/* 主指标：MAPE 前后 */}
            <div className="flex items-baseline gap-1">
              <span className="text-[10px] text-muted-foreground">MAPE 平均相对误差</span>
              <span className="font-mono text-[15px] font-bold text-muted-foreground/70">{stat.beforeMape.toFixed(2)}%</span>
              <span className="text-muted-foreground/60">→</span>
              <span className={cn('font-mono text-[20px] font-bold', VERDICT_CLS[verdict])}>{stat.afterMape.toFixed(2)}%</span>
            </div>
            <span className={cn('flex items-center gap-0.5 font-mono text-[13px] font-semibold', relCls)}>
              {relIcon}
              {stat.rel >= 0 ? '+' : ''}{stat.rel.toFixed(1)}% 相对原始
            </span>

            <div className="h-6 w-px bg-border/60" />

            <MiniStat label="RMSE（MW）" before={stat.beforeRmse} after={stat.afterRmse} />
            <MiniStat label="峰值误差（%）" before={stat.beforePeak} after={stat.afterPeak} />

            <div className="h-6 w-px bg-border/60" />

            {/* 分时段：横向 chips */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-[10px] text-muted-foreground">分时段</span>
              {segRows.map(({ s, pb, pa, key }) => (
                <span key={s.id} className="flex items-center gap-1 text-[10px]">
                  <span className="text-muted-foreground/80">{s.name}</span>
                  <span className="font-mono text-muted-foreground/70">
                    {pb != null && pa != null ? (
                      <>
                        {pb.toFixed(1)}%
                        <span className={cn('mx-0.5', VERDICT_CLS[key])}>→</span>
                        <span className={cn('font-semibold', VERDICT_CLS[key])}>{pa.toFixed(1)}%</span>
                      </>
                    ) : '—'}
                  </span>
                  <span className={cn('flex items-center', VERDICT_CLS[key])}>
                    {(() => { const I = SegIcon(key); return <I className="h-3 w-3" /> })()}
                  </span>
                </span>
              ))}
            </div>

            <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
              {(() => { const I = SegIcon(verdict); return <I className="h-3.5 w-3.5" /> })()}
              整体{verdictLabel}
            </span>
          </>
        ) : (
          <div className="flex flex-1 items-center gap-2 text-[11px] text-muted-foreground">
            对 <span className="font-mono text-foreground">{targetDay}</span>{' '}
            <span className="font-mono text-foreground">{model.toUpperCase()} · D{dayplus}</span> 做操作后，
            <span className="text-foreground/80">这里量化每次调整对预测精度的改善 / 变差程度</span>
            <span className="ml-auto text-muted-foreground/70">调整前基线 MAPE {stat.beforeMape.toFixed(2)}%</span>
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before
  const key: VerdictKey = delta < -0.05 ? 'good' : delta > 0.05 ? 'bad' : 'flat'
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono text-[12px] font-semibold text-muted-foreground/70">{before.toFixed(1)}</span>
      <span className="text-muted-foreground/50">→</span>
      <span className={cn('font-mono text-[14px] font-bold', VERDICT_CLS[key])}>{after.toFixed(1)}</span>
      <span className={cn('text-[10px]', VERDICT_CLS[key])}>{delta < -0.05 ? '↓' : delta > 0.05 ? '↑' : '—'}</span>
    </div>
  )
}
