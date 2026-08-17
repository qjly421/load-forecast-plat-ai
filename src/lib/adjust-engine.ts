// 调整引擎：对 96 点曲线顺序应用操作栈
import type { AdjustOp, SegmentDef } from '@/types/adjust'

const N = 96

/** 分时段权重曲线：段内 1、段外 0，边界余弦过渡 ramp 个 slot */
export function segmentWeights(segment: SegmentDef, ramp = 3): number[] {
  const w = new Array(N).fill(0)
  for (const [a, b] of segment.ranges) {
    for (let i = a; i <= b && i < N; i++) w[i] = 1
    // 左边界过渡
    for (let k = 1; k <= ramp; k++) {
      const i = a - k
      if (i >= 0) w[i] = Math.max(w[i], 0.5 * (1 + Math.cos((k / (ramp + 1)) * Math.PI)))
    }
    // 右边界过渡
    for (let k = 1; k <= ramp; k++) {
      const i = b + k
      if (i < N) w[i] = Math.max(w[i], 0.5 * (1 + Math.cos((k / (ramp + 1)) * Math.PI)))
    }
  }
  return w
}

/** 关键点插值：分段线性，端点外延取最近关键点值 */
export function keypointCurve(points: { slot: number; value: number }[]): number[] {
  const pts = [...points].sort((x, y) => x.slot - y.slot)
  const out = new Array(N).fill(0)
  if (pts.length === 0) return out
  if (pts.length === 1) return out.fill(pts[0].value)
  for (let i = 0; i < N; i++) {
    if (i <= pts[0].slot) {
      out[i] = pts[0].value
    } else if (i >= pts[pts.length - 1].slot) {
      out[i] = pts[pts.length - 1].value
    } else {
      let j = 0
      while (j < pts.length - 2 && pts[j + 1].slot < i) j++
      const p0 = pts[j]
      const p1 = pts[j + 1]
      const t = (i - p0.slot) / Math.max(1, p1.slot - p0.slot)
      out[i] = p0.value + t * (p1.value - p0.value)
    }
  }
  return out
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length

/** 顺序应用操作栈，返回调整后曲线 */
export function applyOps(
  base: number[],
  ops: AdjustOp[],
  segments: SegmentDef[],
): number[] {
  let curve = base.slice()
  for (const op of ops) {
    switch (op.type) {
      case 'shift':
        curve = curve.map((v) => v + op.value)
        break
      case 'scale':
        curve = curve.map((v) => v * op.factor)
        break
      case 'segment': {
        const seg = segments.find((s) => s.id === op.segmentId)
        if (!seg) break
        const w = segmentWeights(seg)
        if (op.mode === 'shift') {
          curve = curve.map((v, i) => v + op.value * w[i])
        } else {
          curve = curve.map((v, i) => v * (1 + op.value * w[i]))
        }
        break
      }
      case 'keypoints': {
        if (op.points.length > 0) curve = keypointCurve(op.points)
        break
      }
      case 'similar': {
        const mC = mean(curve)
        const mS = mean(op.dailyLoad)
        const ratio = mS > 0 ? mC / mS : 1
        curve = curve.map(
          (v, i) => (1 - op.blend) * v + op.blend * op.dailyLoad[i] * ratio,
        )
        break
      }
    }
  }
  return curve
}

/** MAPE（%） */
export function mape(pred: number[], actual: number[]): number {
  let s = 0
  let n = 0
  for (let i = 0; i < Math.min(pred.length, actual.length); i++) {
    if (actual[i] > 0) {
      s += Math.abs(pred[i] - actual[i]) / actual[i]
      n++
    }
  }
  return n > 0 ? (s / n) * 100 : 0
}

/** 区间覆盖率：actual 落在 [lower, upper] 的比例 */
export function coverage(actual: number[], lower: number[], upper: number[]): number {
  let hit = 0
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] >= lower[i] && actual[i] <= upper[i]) hit++
  }
  return (hit / actual.length) * 100
}

export function fmtMw(v: number): string {
  return Math.round(v).toLocaleString()
}

/** slot -> "HH:MM" */
export function slotTime(slot: number): string {
  const h = Math.floor(slot / 4)
  const m = (slot % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
