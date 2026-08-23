import type { ReactNode } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'

interface InfoTipProps {
  /** 指标名，显示在提示卡片顶部 */
  title?: string
  /** 解释文案 */
  children: ReactNode
  className?: string
}

/**
 * 轻量「ⓘ」指标解释 tooltip：
 * 纯 CSS group-hover 弹出，不引入新依赖。
 * 关键指标名称旁悬浮显示专业口径解释，帮助理解指标含义。
 */
export function InfoTip({ title, children, className }: InfoTipProps) {
  return (
    <span className={cn('group/info relative inline-flex items-center align-middle', className)}>
      <Info className="h-3 w-3 cursor-help text-muted-foreground opacity-70 transition-opacity group-hover/info:opacity-100" />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-[999] mb-1.5 w-max max-w-[240px] -translate-x-1/2 rounded-lg border border-[hsl(217_33%_20%)] bg-[hsl(222_44%_10%)] px-3 py-2 text-left shadow-xl opacity-0 transition-opacity duration-150 group-hover/info:opacity-100"
      >
        {title && <span className="mb-1 block text-[11px] font-semibold text-cyan-300">{title}</span>}
        <span className="block text-[11px] font-normal leading-relaxed text-foreground">{children}</span>
      </span>
    </span>
  )
}
