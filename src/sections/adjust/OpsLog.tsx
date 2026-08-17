import { ScrollText, Undo2, RotateCcw, Save, Download, MoveVertical, Percent, Clock3, Anchor, Blend } from 'lucide-react'
import type { AdjustOp } from '@/types/adjust'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface OpsLogProps {
  ops: AdjustOp[]
  savedAt: number | null
  onUndo: () => void
  onReset: () => void
  onSave: () => void
  onExport: () => void
}

const TYPE_META: Record<string, { icon: typeof MoveVertical; color: string; name: string }> = {
  shift: { icon: MoveVertical, color: 'text-cyan-400 bg-cyan-400/10', name: '平移' },
  scale: { icon: Percent, color: 'text-emerald-400 bg-emerald-400/10', name: '缩放' },
  segment: { icon: Clock3, color: 'text-violet-400 bg-violet-400/10', name: '时段' },
  keypoints: { icon: Anchor, color: 'text-amber-400 bg-amber-400/10', name: '关键点' },
  similar: { icon: Blend, color: 'text-fuchsia-400 bg-fuchsia-400/10', name: '相似日' },
}

export default function OpsLog({ ops, savedAt, onUndo, onReset, onSave, onExport }: OpsLogProps) {
  return (
    <div className="card-glow flex h-full flex-col rounded-xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <ScrollText className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">操作记录</h3>
          <Badge variant="outline" className="border-border bg-secondary/60 text-[10px] text-muted-foreground">
            {ops.length} 步
          </Badge>
        </div>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-7 w-7" title="撤销上一步"
            disabled={ops.length === 0} onClick={onUndo}>
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-7 w-7" title="重置全部"
            disabled={ops.length === 0} onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: 300 }}>
        {ops.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1 text-muted-foreground">
            <ScrollText className="h-5 w-5 opacity-40" />
            <p className="text-[11px]">暂无调整操作，使用左侧工具开始调整</p>
          </div>
        ) : (
          <div className="space-y-1 pr-1">
            {[...ops].reverse().map((op, idx) => {
              const meta = TYPE_META[op.type]
              return (
                <div key={op.id}
                  className={cn('flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-2 py-1.5', idx === 0 && 'border-primary/40 bg-primary/5')}>
                  <span className={cn('flex h-5 w-5 shrink-0 items-center justify-center rounded', meta.color)}>
                    <meta.icon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-medium">{op.label}</div>
                    <div className="text-[9px] text-muted-foreground">
                      第 {ops.length - idx} 步 · {new Date(op.ts).toLocaleTimeString('zh-CN', { hour12: false })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
        <div className="flex gap-1.5">
          <Button size="sm" className="h-7 flex-1 text-xs" disabled={ops.length === 0} onClick={onSave}>
            <Save className="mr-1 h-3 w-3" />保存记录
          </Button>
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" disabled={ops.length === 0} onClick={onExport}>
            <Download className="mr-1 h-3 w-3" />导出 JSON
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground">
          {savedAt
            ? `已保存 · ${new Date(savedAt).toLocaleTimeString('zh-CN', { hour12: false })}（切换日期自动恢复）`
            : '保存后存入浏览器本地，切换目标日自动恢复'}
        </p>
      </div>
    </div>
  )
}
