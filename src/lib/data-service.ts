// 数据服务：按需 fetch 预处理 JSON，带内存缓存
import type { FeatureCollection } from 'geojson'
import type {
  ForecastFile,
  WeatherFile,
  SimilarFile,
  MetaFile,
  InstalledCapacityFile,
  WindSolarSitesFile,
  RampSeriesFile,
  ModelCompareFile,
  CrossRegionFile,
  WeatherLoadCouplingFile,
  LoadMetricsFile,
  DeepCostFile,
} from '@/types/adjust'

const cache: Record<string, unknown> = {}
const BASE = import.meta.env.BASE_URL ?? '/'

async function loadJson<T>(path: string): Promise<T> {
  if (cache[path]) return cache[path] as T
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`加载失败: ${path} (${res.status})`)
  const data = (await res.json()) as T
  cache[path] = data
  return data
}

export const loadMeta = () => loadJson<MetaFile>('data/meta.json')
export const loadWeather = () => loadJson<WeatherFile>('data/weather.json')
export const loadSimilar = () => loadJson<SimilarFile>('data/similar.json')
export const loadForecast = (model: string) =>
  loadJson<ForecastFile>(`data/forecast_sd_${model}.json`)
export const loadForecastFor = (dataset: string, model: string) =>
  loadJson<ForecastFile>(`data/forecast_${dataset}_${model}.json`)
export const loadLoadMetrics = () => loadJson<LoadMetricsFile>('data/load_metrics.json')
export const loadDeepCost = () => loadJson<DeepCostFile>('data/deep_cost.json')
export const loadInstalledCapacity = () =>
  loadJson<InstalledCapacityFile>('data/installed_capacity.json')
export const loadWindSolarSites = () =>
  loadJson<WindSolarSitesFile>('data/wind_solar_sites.json')
export const loadShandongGeo = () =>
  loadJson<FeatureCollection>('data/shape/shandong_geo.json')
export const loadRampSeries = (region: 'nl' | 'be' | 'sd') =>
  loadJson<RampSeriesFile>(`data/ramp_series_${region}.json`)
export const loadCrossRegion = () =>
  loadJson<CrossRegionFile>('data/cross_region_metrics.json')
export const loadModelCompare = () =>
  loadJson<ModelCompareFile>('data/model_compare.json')
export const loadWeatherLoadCoupling = (season: 'winter' | 'summer' = 'winter') =>
  loadJson<WeatherLoadCouplingFile>(
    season === 'summer' ? 'data/gefcom_weather_load_summer.json' : 'data/gefcom_weather_load.json',
  )

// ---- 操作记录持久化（localStorage） ----
import type { SavedSession } from '@/types/adjust'

const key = (model: string, targetDay: string, dayplus: number) =>
  `sd-adjust:${model}:${targetDay}:D${dayplus}`

export function saveSession(s: SavedSession) {
  try {
    localStorage.setItem(key(s.model, s.targetDay, s.dayplus), JSON.stringify(s))
  } catch {
    /* 存储满时静默失败 */
  }
}

export function loadSession(
  model: string,
  targetDay: string,
  dayplus: number,
): SavedSession | null {
  try {
    const raw = localStorage.getItem(key(model, targetDay, dayplus))
    return raw ? (JSON.parse(raw) as SavedSession) : null
  } catch {
    return null
  }
}

export function listSessions(): SavedSession[] {
  const out: SavedSession[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith('sd-adjust:')) {
        const v = localStorage.getItem(k)
        if (v) out.push(JSON.parse(v) as SavedSession)
      }
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt)
}

/** 导出调整结果为 JSON 文件下载 */
export function exportSession(
  session: SavedSession,
  adjusted: number[],
  actual: number[],
) {
  const payload = {
    出口说明: '山东负荷预测手动调整结果',
    目标日: session.targetDay,
    模型: session.model,
    提前期: `D${session.dayplus}`,
    保存时间: new Date(session.savedAt).toISOString(),
    操作数: session.ops.length,
    操作记录: session.ops.map(({ id, ts, type, label, ...rest }) => ({
      时间: new Date(ts).toISOString(),
      类型: type,
      说明: label,
      参数: rest,
    })),
    调整后预测: adjusted.map(Math.round),
    实际负荷: actual,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `adjusted_${session.targetDay}_${session.model}_D${session.dayplus}.json`
  a.click()
  URL.revokeObjectURL(url)
}
