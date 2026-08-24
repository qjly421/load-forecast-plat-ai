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

// ---- 负荷爬坡事件概率预警（多区域 · 跨电网零样本泛化） ----

export interface RampDay {
  t: string[] // 15min 时间戳（本地时）
  prob: number[] // 模型预测「未来 1h 发生爬坡」的概率 0-1
  label: number[] // 真实爬坡事件标签 0/1
  dP_mw: (number | null)[] // 未来 1h 负荷变化量（MW）
  load: (number | null)[] // 实际负荷（MW）
}

export interface RampSeriesMeta {
  points_per_day: number
  ramp_window_hours: number
  window_start: string
  window_end: string
  n_days: number
  n_points: number
  feature_note?: string
  load_field?: string
}

export interface RampSeriesFile {
  region: string
  model: string
  source_exp?: string
  metas: RampSeriesMeta
  days: Record<string, RampDay> // date -> 当日 96 点
}

export interface ModelCompareMetric {
  auc?: number
  pr_auc?: number
  brier?: number
  f1_at_best?: number
  best_threshold?: number
  delta_auc?: number
  delta_t_lgb?: unknown
}

export interface ModelCompareFile {
  note?: string
  test_samples?: number
  threshold?: number
  large_threshold?: number
  best_model_overall?: string
  any: Record<string, ModelCompareMetric | Record<string, unknown>>
  up?: Record<string, ModelCompareMetric | Record<string, unknown>>
  down?: Record<string, ModelCompareMetric | Record<string, unknown>>
}

// ---- 气象-负荷耦合（GEFCom2014-L · 25 站温度 × 指数负荷） ----

export interface WeatherLoadCouplingFile {
  source: string
  window: string
  stats: {
    pearson: number
    n: number
    tempMin: number
    tempMax: number
    loadMin: number
    loadMax: number
    hot_avgTemp: number | null
    hot_avgLoad: number | null
    hot_n: number
    cold_avgTemp: number | null
    cold_avgLoad: number | null
    cold_n: number
    total_avgLoad: number
  }
  scatter: { t: number; load: number }[]
  segments: { lo: number; hi: number; t: number; load: number; n: number }[]
  daily: { hour: number; tmean: number; load: number }[]
}

// ---- 负荷预测多数据集 × 多模型评测（新主线） ----

export interface LoadDatasetMeta {
  id: string
  name: string
  unit: string
  tz: string
  test_start: string
  test_end: string
  label: string
}

export interface LoadModelMeta {
  id: string
  name: string
}

export interface LoadMetricRow {
  mape: number // %
  picp: number // 覆盖率 %
  mpiw: number // MW
  rmse: number // MW
  peak_mw: number // MW
}

export interface LoadMetricsFile {
  datasets: LoadDatasetMeta[]
  models: LoadModelMeta[]
  // dataset -> model -> 指标
  metrics: Record<string, Record<string, LoadMetricRow>>
}

/** 深度基线对比（负荷预测 TCN vs Transformer）：参数 / 训练耗时 / 各提前期 MAPE/PICP */
export interface DeepCostModel {
  id: string
  name: string
  n_params: number
  /** 规模单位说明：神经网络=参数量，GBDT=规模(树×叶) */
  size_label?: string
  train_time_s: number
  horizon: Record<string, { mape: number; picp: number }>
}
export interface DeepCostFile {
  models: DeepCostModel[]
}

/** 跨区域泛化（松结构：研究侧指标，前端只取需要的字段） */
export interface CrossRegionFile {
  methodology?: Record<string, unknown>
  per_region?: Record<string, { peak_mw?: number; threshold_mw?: number; positive_rate?: number; n_samples?: number }>
  experiments?: Record<string, { train_region?: string; eval_region?: string; n_features?: number; metrics?: { auc?: number; pr_auc?: number; brier?: number } }>
  experiments_scale_normalized?: Record<string, { src: string; dst: string; auc: number; pr_auc: number; brier: number; n_feat: number }>
  conclusions?: Record<string, unknown>
}
