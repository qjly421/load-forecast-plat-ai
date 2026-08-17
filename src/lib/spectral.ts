// 时频域分析：用自相关识别负荷周期性（不引入外部依赖，纯 TS 实现）

export interface PeriodicityPeak {
  periodHours: number // 周期（小时）
  correlation: number // 归一化自相关系数 r(τ)/r(0)，越接近 1 周期性越强
  kind: 'daily' | 'weekly'
}

/** 自相关（去均值），返回归一化自相关系数序列 r[0..maxLag-1] */
export function autocorrelation(signal: number[], maxLag?: number): number[] {
  const n = signal.length
  const max = Math.min(maxLag ?? n, n)
  const mean = signal.reduce((s, v) => s + v, 0) / n
  const centered = signal.map((v) => v - mean)
  const r0 = centered.reduce((s, v) => s + v * v, 0)
  if (r0 <= 0) return new Array(max).fill(0)
  const out: number[] = new Array(max).fill(0)
  for (let k = 0; k < max; k++) {
    let s = 0
    for (let i = 0; i < n - k; i++) s += centered[i] * centered[i + k]
    out[k] = s / r0
  }
  return out
}

/**
 * 分析负荷序列的周期性：
 * - 日内周期：对全序列做自相关，衡量 24h / 12h / 8h 标准周期的重复强度
 * - 周周期：把序列按天聚合为日均负荷后再做自相关，检测 3~14 天内的最强峰
 * 返回按强度降序的周期列表。
 * @param series 连续负荷序列（15 分钟采样）
 * @param slotHours 每个采样点的小时数（15 分钟 = 0.25）
 */
export function analyzePeriodicity(
  series: number[],
  slotHours: number,
): PeriodicityPeak[] {
  const n = series.length
  const ptsPerDay = Math.round(24 / slotHours)
  const days = Math.floor(n / ptsPerDay)
  if (days < 3) return []

  const maxLag = Math.min(n, Math.floor(120 / slotHours))
  const acf = autocorrelation(series, maxLag)
  const at = (hours: number): number => {
    const lag = Math.round(hours / slotHours)
    return lag < acf.length ? acf[lag] : 0
  }

  const out: PeriodicityPeak[] = []
  // 日内标准周期（衡量信号在这些周期上的重复强度）
  for (const h of [24, 12]) {
    out.push({ periodHours: h, correlation: at(h), kind: 'daily' })
  }

  // 周周期：日均序列自相关，直接衡量 7 天（168h）处的重复强度
  const daily: number[] = []
  for (let d = 0; d < days; d++) {
    let s = 0
    for (let i = 0; i < ptsPerDay; i++) s += series[d * ptsPerDay + i]
    daily.push(s / ptsPerDay)
  }
  const acfDaily = autocorrelation(daily, days)
  const weeklyLag = 7
  if (weeklyLag < acfDaily.length) {
    out.push({ periodHours: weeklyLag * 24, correlation: acfDaily[weeklyLag], kind: 'weekly' })
  }

  return out.sort((a, b) => b.correlation - a.correlation)
}
