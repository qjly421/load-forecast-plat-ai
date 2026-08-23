// 手动预测调整工作台 — 类型定义

export interface DayForecast {
  origin: string
  actual: number[]
  center: number[]
  lower: number[]
  upper: number[]
  atemp: number[]
}

export type ForecastByDayplus = Record<string, DayForecast> // dayplus -> forecast
export type ForecastFile = Record<string, ForecastByDayplus> // targetDay -> ...

export interface WeatherDay {
  load: number[]
  temp: number[]
  atemp: number[]
  rad: number[]
  cloud: number[]
  prec: number[]
}
export type WeatherFile = Record<string, WeatherDay>

export interface SimilarDay {
  date: string
  rank: number
  similarity_score: number
  load_distance: number
  weather_distance: number
  daily_load: number[]
  weather_summary: Record<string, number>
  day_of_week: string
  is_weekend: boolean
}
export type SimilarFile = Record<string, SimilarDay[]>

export interface SegmentDef {
  id: string
  name: string
  ranges: [number, number][]
  hours: string
}

export interface MetaFile {
  targetDays: string[]
  dayplusOptions: number[]
  models: { id: string; name: string }[]
  segments: SegmentDef[]
  slotMinutes: number
}

// ---- 操作记录 ----
export type OpType = 'shift' | 'scale' | 'segment' | 'keypoints' | 'similar'

export interface OpBase {
  id: string
  ts: number
  type: OpType
  label: string // 人类可读描述
}

export interface ShiftOp extends OpBase {
  type: 'shift'
  value: number // MW
}
export interface ScaleOp extends OpBase {
  type: 'scale'
  factor: number // 1.02 = +2%
}
export interface SegmentOp extends OpBase {
  type: 'segment'
  segmentId: string
  mode: 'shift' | 'scale'
  value: number // shift: MW; scale: 比例（0.02）
}
export interface KeypointsOp extends OpBase {
  type: 'keypoints'
  points: { slot: number; value: number }[] // 绝对值
}
export interface SimilarOp extends OpBase {
  type: 'similar'
  date: string
  blend: number // 0-1 相似日形状混入比例
  dailyLoad: number[]
}

export type AdjustOp = ShiftOp | ScaleOp | SegmentOp | KeypointsOp | SimilarOp

export interface SavedSession {
  targetDay: string
  model: string
  dayplus: number
  ops: AdjustOp[]
  savedAt: number
}

// ---- 电源装机结构 ----
export interface InstalledCapacityCategory {
  id: string
  name: string
  capacity: number // 万千瓦
  valueType: 'official' | 'derived' // official=官方直接披露；derived=据官方口径推算
  source: string // 该分类数据来源说明
}

export interface InstalledCapacitySource {
  name: string // 来源机构
  title: string
  url: string
  year: number
}

export interface InstalledCapacityFile {
  year: number
  unit: string
  region: string
  total: number // 万千瓦
  totalType: 'official' | 'derived'
  totalNote: string
  categories: InstalledCapacityCategory[]
  sources: InstalledCapacitySource[]
  note: string
}

// ---- 新能源电力地理（地图） ----
export type EnergySiteType = 'wind' | 'solar'

export interface WindSolarSite {
  name: string
  type: EnergySiteType // wind=风电；solar=光伏
  subtype: string // offshore/onshore（风电）、utility/solar（光伏）
  capacityMw: number // 装机容量（MW）
  lat: number
  lng: number
  city: string
  status: string // operating 等
  coordAccuracy: string // approximate=区域近似；exact=场址中心
  year: number | null // 投产年份；null=旧 GPPD 点（无投产年份）
  sourceName: string
  sourceUrl: string
  sourceYear: number | null // 数据采集年份
}

export interface WindSolarSiteSource {
  name: string // 来源机构
  url: string
  year: number | null // 数据口径年份；null=旧口径
  note: string
}

export interface WindSolarSitesFile {
  sources: WindSolarSiteSource[]
  note: string
  generatedAt: string
  sites: WindSolarSite[]
}
