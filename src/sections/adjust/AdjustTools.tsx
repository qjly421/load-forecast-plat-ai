import { useState } from 'react'
import { MoveVertical, Percent, Clock3, Anchor, Plus, Trash2, Check } from 'lucide-react'
import type { AdjustOp, SegmentDef } from '@/types/adjust'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { slotTime, fmtMw, keypointCurve } from '@/lib/adjust-engine'

interface AdjustToolsProps {
  segments: SegmentDef[]
  onAddOp: (op: AdjustOp) => void
  onPreview: (op: AdjustOp | null) => void
  keypointMode: boolean
  onKeypointModeChange: (v: boolean) => void
  keypoints: { slot: number; value: number }[]
  onKeypointsChange: (pts: { slot: number; value: number }[]) => void
  onApplyKeypoints: () => void
}

let opSeq = 0
const newId = () => `op_${Date.now()}_${opSeq++}`

export default function AdjustTools({
  segments,
  onAddOp,
  onPreview,
  keypointMode,
  onKeypointModeChange,
  keypoints,
  onKeypointsChange,
  onApplyKeypoints,
}: AdjustToolsProps) {
  const [shift, setShift] = useState(0)
  const [scale, setScale] = useState(0)
  const [segId, setSegId] = useState(segments[0]?.id ?? 'night')
  const [segMode, setSegMode] = useState<'shift' | 'scale'>('shift')
  const [segShift, setSegShift] = useState(0)
  const [segScale, setSegScale] = useState(0)

  const activeSeg = segments.find((s) => s.id === segId) ?? segments[0]

  // 预览：滑块拖动时实时反馈曲线，但不入操作栈
  const previewShift = (v: number) => {
    setShift(v)
    onPreview(v === 0 ? null : { id: 'preview', ts: 0, type: 'shift', value: v, label: '' })
    setScale(0)
  }
  const commitShift = () => {
    if (shift === 0) return
    onAddOp({ id: newId(), ts: Date.now(), type: 'shift', value: shift, label: `整日平移 ${shift > 0 ? '+' : ''}${fmtMw(shift)} MW` })
    setShift(0)
    onPreview(null)
  }

  const previewScale = (v: number) => {
    setScale(v)
    onPreview(v === 0 ? null : { id: 'preview', ts: 0, type: 'scale', factor: 1 + v / 100, label: '' })
    setShift(0)
  }
  const commitScale = () => {
    if (scale === 0) return
    onAddOp({ id: newId(), ts: Date.now(), type: 'scale', factor: 1 + scale / 100, label: `整日缩放 ${scale > 0 ? '+' : ''}${scale}%` })
    setScale(0)
    onPreview(null)
  }

  const previewSegmentShift = (v: number) => {
    setSegShift(v)
    onPreview(v === 0 ? null : { id: 'preview', ts: 0, type: 'segment', segmentId: segId, mode: 'shift', value: v, label: '' })
  }
  const previewSegmentScale = (v: number) => {
    setSegScale(v)
    onPreview(v === 0 ? null : { id: 'preview', ts: 0, type: 'segment', segmentId: segId, mode: 'scale', value: v / 100, label: '' })
  }

  const applySegment = () => {
    if (segMode === 'shift') {
      if (segShift === 0) return
      onAddOp({
        id: newId(), ts: Date.now(), type: 'segment', segmentId: segId, mode: 'shift',
        value: segShift,
        label: `${activeSeg.name}平移 ${segShift > 0 ? '+' : ''}${fmtMw(segShift)} MW`,
      })
      setSegShift(0)
    } else {
      if (segScale === 0) return
      onAddOp({
        id: newId(), ts: Date.now(), type: 'segment', segmentId: segId, mode: 'scale',
        value: segScale / 100,
        label: `${activeSeg.name}缩放 ${segScale > 0 ? '+' : ''}${segScale}%`,
      })
      setSegScale(0)
    }
    onPreview(null)
  }

  const segPreview = segMode === 'shift' ? segShift : segScale

  return (
    <div className="card-glow flex h-full flex-col rounded-xl p-4">
      <h3 className="mb-3 text-sm font-semibold">手动调整工具</h3>

      {/* 整日平移 */}
      <ToolBlock icon={<MoveVertical className="h-3.5 w-3.5 text-cyan-400" />} title="整日平移"
        value={`${shift > 0 ? '+' : ''}${fmtMw(shift)} MW`} onApply={commitShift} applyDisabled={shift === 0}>
        <Slider value={[shift]} onValueChange={([v]) => previewShift(v)}
          min={-6000} max={6000} step={100} />
        <ScaleMarks marks={['-6k', '-3k', '0', '+3k', '+6k']} />
      </ToolBlock>

      {/* 比例缩放 */}
      <ToolBlock icon={<Percent className="h-3.5 w-3.5 text-emerald-400" />} title="整日缩放"
        value={`${scale > 0 ? '+' : ''}${scale}%`} onApply={commitScale} applyDisabled={scale === 0}>
        <Slider value={[scale]} onValueChange={([v]) => previewScale(v)}
          min={-15} max={15} step={0.5} />
        <ScaleMarks marks={['-15%', '-7.5%', '0', '+7.5%', '+15%']} />
      </ToolBlock>

      {/* 分时段调整 */}
      <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5 text-violet-400" />
          分时段调整
        </div>
        <div className="mb-2.5 grid grid-cols-4 gap-1">
          {segments.map((s) => (
            <button key={s.id} onClick={() => setSegId(s.id)}
              className={cn(
                'rounded-md border px-1.5 py-1.5 text-xs transition-colors',
                segId === s.id
                  ? 'border-primary/60 bg-primary/15 font-semibold text-primary'
                  : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/40',
              )}>
              {s.name}
            </button>
          ))}
        </div>
        <div className="mb-2 text-[10px] text-muted-foreground">{activeSeg?.hours}</div>
        <div className="mb-2 flex gap-1">
          {(['shift', 'scale'] as const).map((m) => (
            <button key={m} onClick={() => setSegMode(m)}
              className={cn(
                'flex-1 rounded-md border px-2 py-1 text-xs transition-colors',
                segMode === m
                  ? 'border-primary/60 bg-primary/15 font-medium text-primary'
                  : 'border-border bg-card text-muted-foreground',
              )}>
              {m === 'shift' ? '平移 MW' : '缩放 %'}
            </button>
          ))}
        </div>
        {segMode === 'shift' ? (
          <Slider value={[segShift]} onValueChange={([v]) => previewSegmentShift(v)} min={-4000} max={4000} step={100} />
        ) : (
          <Slider value={[segScale]} onValueChange={([v]) => previewSegmentScale(v)} min={-12} max={12} step={0.5} />
        )}
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {segMode === 'shift' ? `${segShift > 0 ? '+' : ''}${fmtMw(segShift)} MW` : `${segScale > 0 ? '+' : ''}${segScale}%`}
          </span>
          <Button size="sm" className="h-6 px-2.5 text-xs" disabled={segPreview === 0} onClick={applySegment}>
            <Check className="mr-1 h-3 w-3" />应用
          </Button>
        </div>
      </div>

      {/* 关键点调整 */}
      <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Anchor className="h-3.5 w-3.5 text-amber-400" />
            关键点调整
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="kp-mode" className="text-[10px] text-muted-foreground">模式</Label>
            <Switch id="kp-mode" checked={keypointMode} onCheckedChange={onKeypointModeChange} />
          </div>
        </div>
        {keypoints.length === 0 ? (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            开启模式后点击主图曲线添加关键点，拖动数值后整曲线按关键点插值重塑。
          </p>
        ) : (
          <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
            {[...keypoints].sort((a, b) => a.slot - b.slot).map((p) => (
              <div key={p.slot} className="flex items-center gap-1.5">
                <Badge variant="outline" className="w-14 shrink-0 justify-center border-amber-400/40 bg-amber-400/10 font-mono text-[10px] text-amber-300">
                  {slotTime(p.slot)}
                </Badge>
                <Input
                  type="number"
                  className="h-6 flex-1 px-1.5 font-mono text-[11px]"
                  value={p.value}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (!Number.isNaN(v)) {
                      onKeypointsChange(keypoints.map((k) => (k.slot === p.slot ? { ...k, value: v } : k)))
                    }
                  }}
                />
                <button className="text-muted-foreground hover:text-destructive"
                  onClick={() => onKeypointsChange(keypoints.filter((k) => k.slot !== p.slot))}>
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {keypoints.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            <Button size="sm" className="h-6 flex-1 px-2 text-xs" disabled={keypoints.length < 2} onClick={onApplyKeypoints}>
              <Plus className="mr-1 h-3 w-3" />应用关键点（{keypoints.length}）
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onKeypointsChange([])}>
              清空
            </Button>
          </div>
        )}
      </div>

      <p className="mt-auto pt-3 text-[10px] leading-relaxed text-muted-foreground">
        提示：拖动滑块实时预览曲线，点「应用」才记入操作记录；关键点至少 2 个才能插值，建议先锚定不调整的时段。
      </p>
    </div>
  )
}

function ToolBlock({ icon, title, value, children, onApply, applyDisabled }: {
  icon: React.ReactNode; title: string; value: string; children: React.ReactNode
  onApply: () => void; applyDisabled: boolean
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/40 p-3 [&+&]:mt-4 mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {icon}{title}
        </div>
        <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">{value}</span>
      </div>
      {children}
      <div className="mt-1.5 flex justify-end">
        <Button size="sm" className="h-6 px-2.5 text-xs" disabled={applyDisabled} onClick={onApply}>
          <Check className="mr-1 h-3 w-3" />应用
        </Button>
      </div>
    </div>
  )
}

function ScaleMarks({ marks }: { marks: string[] }) {
  return (
    <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
      {marks.map((m) => <span key={m}>{m}</span>)}
    </div>
  )
}

export { keypointCurve }
