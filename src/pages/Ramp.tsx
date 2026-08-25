import { Zap, Rocket, GitCompare, Globe, CloudSun } from 'lucide-react'
import RampForecast from '@/sections/home/RampForecast'
import WeatherLoadCoupling from '@/sections/home/WeatherLoadCoupling'

/**
 * 爬坡预警 · 系统前沿创新主界面
 * 负荷爬坡事件概率预警（跨电网零样本）+ 多模型对比 + 气象-负荷耦合。
 */
export default function Ramp() {
  return (
    <main className="bg-grid min-h-screen bg-background">
      {/* 页面头 */}
      <div className="border-b border-border/80 bg-background/85">
        <div className="mx-auto flex max-w-[1700px] flex-wrap items-center justify-between gap-2 px-6 py-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <h1 className="text-sm font-semibold">负荷爬坡事件概率预警</h1>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>跨电网零样本 · 多模型同口径 · 气象耦合</span>
          </div>
        </div>
        <div className="mx-auto max-w-[1700px] px-6 pb-3 text-[11px] leading-relaxed text-muted-foreground">
          面向智能电网的<b className="text-amber-300">负荷爬坡风险研判</b>：对未来 1 小时内电力负荷的剧烈变化进行预测与预警，兼顾调度可用性与多模型可靠性；并揭示<b className="text-sky-300">气象-负荷耦合</b>这一爬坡风险的重要成因。
        </div>
      </div>

      <div className="mx-auto max-w-[1700px] space-y-3 px-6 py-4">
        {/* 一 · 跨电网爬坡预警 + 多模型对比 */}
        <section>
          <div className="mb-1 flex items-center gap-1.5">
            <Rocket className="h-3.5 w-3.5 text-amber-400" />
            <h2 className="text-[13px] font-semibold">跨电网爬坡事件概率预警 · 多模型对比</h2>
          </div>
          <RampForecast />
        </section>

        {/* 二 · 气象-负荷耦合 */}
        <section>
          <div className="mb-1 flex items-center gap-1.5">
            <CloudSun className="h-3.5 w-3.5 text-sky-400" />
            <h2 className="text-[13px] font-semibold">气象-负荷耦合 · 爬坡风险成因</h2>
          </div>
          <WeatherLoadCoupling />
        </section>

        {/* 三 · 技术亮点速览 */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <HighlightCard icon={<Globe className="h-4 w-4 text-emerald-400" />} title="跨电网零样本泛化"
            desc="负荷按各区域峰值标幺（占比）后，德/荷/比三电网爬坡规律可迁移——用一个电网训练的模型在另一个电网零样本预警，AUC≈0.90。" />
          <HighlightCard icon={<GitCompare className="h-4 w-4 text-violet-400" />} title="多模型同口径对比"
            desc="LGB / Transformer 在同一测试集上 PK，AUC / PR-AUC / Brier / F1 全透明，公正呈现 LightGBM 占优，不刻意拔高任一模型。" />
          <HighlightCard icon={<CloudSun className="h-4 w-4 text-sky-400" />} title="气象-负荷耦合"
            desc="25 站温度×负荷逐小时对齐，用 GEFCom2014-L 实证气象是负荷最核心驱动因子（本窗口采暖主导 r≈−0.78），为爬坡风险提供气象诱因。" />
        </section>
      </div>
    </main>
  )
}

function HighlightCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="card-glow rounded-xl p-4">
      <div className="mb-1.5 flex items-center gap-1.5">{icon}<h3 className="text-[13px] font-semibold">{title}</h3></div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">{desc}</p>
    </div>
  )
}
