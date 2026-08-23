import { useState, type ReactNode } from 'react'
import { ChevronDown, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

interface CollapsibleInfoProps {
  children: ReactNode
  summary?: string
  className?: string
}

/**
 * 可折叠「数据与口径说明」：
 * 默认收起，点击标题行展开显示口径/来源信息。
 * 复用现有 Radix collapsible，无新增依赖。
 */
export function CollapsibleInfo({ children, summary, className }: CollapsibleInfoProps) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('rounded-xl border border-border bg-card/60', className)}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 px-4 py-3 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 text-orange-400" />
        <span>{summary ?? '数据与口径说明'}</span>
        <ChevronDown className={cn('ml-auto h-3.5 w-3.5 shrink-0 transition-transform duration-200', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-3 text-[11px] leading-relaxed text-muted-foreground">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
