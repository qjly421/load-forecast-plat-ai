import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, Sun, Wind, Landmark } from 'lucide-react'
import type { FeatureCollection } from 'geojson'
import { cn } from '@/lib/utils'
import { Switch } from '@/components/ui/switch'
import { loadWindSolarSites, loadShandongGeo } from '@/lib/data-service'
import type { WindSolarSite, WindSolarSiteSource } from '@/types/adjust'

/**
 * 新能源电力地理 · 山东电源结构背景
 * leaflet + 本地山东 GeoJSON 底图（不依赖 OSM 瓦片，断网可显示）。
 * 底图为 16 地级市轮廓；场站用 divIcon 圆形 marker，大小随装机容量，
 * 风电=青色 / 光伏=琥珀色，近年 18 个为主视觉，旧 GPPD 106 个默认隐藏可开关。
 */
export default function EnergyMap() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstance = useRef<L.Map | null>(null)
  const markerGroup = useRef<L.LayerGroup | null>(null)

  const [sites, setSites] = useState<WindSolarSite[] | null>(null)
  const [sources, setSources] = useState<WindSolarSiteSource[]>([])
  const [geo, setGeo] = useState<FeatureCollection | null>(null)
  const [showWind, setShowWind] = useState(true)
  const [showSolar, setShowSolar] = useState(true)
  const [showHistory, setShowHistory] = useState(false)

  // 初始化地图（仅一次）
  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return
    const map = L.map(mapRef.current, {
      center: [37.0, 118.6], // 山东中部（默认，加载底图后再自适应）
      zoom: 7,
      zoomControl: false,
      attributionControl: false,
    })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    mapInstance.current = map
    return () => {
      map.remove()
      mapInstance.current = null
    }
  }, [])

  // 容器尺寸变化时让 leaflet 重算尺寸
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => mapInstance.current?.invalidateSize())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 装载场站 + 底图数据
  useEffect(() => {
    let alive = true
    Promise.all([loadWindSolarSites(), loadShandongGeo()])
      .then(([sd, g]) => {
        if (!alive) return
        setSites(sd.sites)
        setSources(sd.sources)
        setGeo(g)
      })
      .catch(() => {
        /* 数据加载失败不阻塞页面 */
      })
    return () => {
      alive = false
    }
  }, [])

  // 底图（山东 16 地级市轮廓）加载后绘制，加城市名，并自适应视野（撑满、少留白）
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !geo) return
    // 山东面：深蓝实底（不透出白）+ 青色亮边界，更高级
    const layer = L.geoJSON(geo, {
      style: () => ({
        color: 'hsl(187 90% 52% / 0.85)',
        weight: 1.4,
        fillColor: 'hsl(208 44% 13%)',
        fillOpacity: 0.78,
      }),
    })
    layer.addTo(map)
    // 地级市名标签（淡色小字，专业地图感；放在边界之上）
    L.layerGroup(
      geo.features.map((f) => {
        const name = (f.properties as { name?: string })?.name
        const c = (f.properties as { center?: [number, number] })?.center // [lng, lat]
        if (!name || !c) return L.tooltip()
        return L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'energy-city-label',
        })
          .setLatLng([c[1], c[0]])
          .setContent(name)
      }),
    ).addTo(map)
    const bounds = layer.getBounds()
    if (bounds.isValid()) map.fitBounds(bounds, { paddingTopLeft: [16, 16], paddingBottomRight: [16, 16] })
  }, [geo])

  // 场站 marker（随筛选变化重建）
  useEffect(() => {
    const map = mapInstance.current
    if (!map || !sites) return
    const prev = markerGroup.current
    if (prev) prev.remove()
    const group = L.layerGroup()
    const visible = sites.filter((s) => {
      if (s.type === 'wind' && !showWind) return false
      if (s.type === 'solar' && !showSolar) return false
      if (s.year == null && !showHistory) return false
      return true
    })
    visible.forEach((s) => buildSiteMarker(s).addTo(group))
    group.addTo(map)
    markerGroup.current = group
  }, [sites, showWind, showSolar, showHistory])

  // 展示全部来源（含 2024-25 最新项目），按归档 year（无年 → 旧口径）排序，精简为可读标签
  const mainSources = [...sources]
    .sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
    .map((s) => ({ label: sourceLabel(s), s }))
    .filter((x) => x.s?.url)

  return (
    <div className="card-glow rounded-xl p-4">
      {/* 标题 + 主view卖点文案 */}
      <div className="mb-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold">
          <MapPin className="h-3.5 w-3.5 text-cyan-400" />
          新能源电力地理 · 山东电源结构背景
        </h3>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          山东省新能源装机全国领先（光伏连续 7 年全国第一、海上风电居全国前三）。系统在给出负荷预测的同时，以全省新能源场站分布呈现电网电源结构背景与消纳约束，帮助理解负荷曲线背后的新能源反调峰（如光伏午间大发压低午谷、风电夜间大发压低夜谷）特征。
        </p>
      </div>

      {/* 筛选与图层控制 */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">场站类型</span>
          <button
            onClick={() => setShowWind((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
              showWind
                ? 'border-cyan-400/50 bg-cyan-500/15 text-cyan-300'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Wind className="h-3 w-3" />风电
          </button>
          <button
            onClick={() => setShowSolar((v) => !v)}
            className={cn(
              'flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors',
              showSolar
                ? 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                : 'border-border bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Sun className="h-3 w-3" />光伏
          </button>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <Switch checked={showHistory} onCheckedChange={setShowHistory} />
          <span>显示历史站点（GPPD 2017-18 口径 · 106 个）</span>
        </label>
      </div>

      {/* 地图 + 图例 */}
      <div className="relative">
        <div ref={mapRef} className="h-[560px] w-full overflow-hidden rounded-xl border border-border/60" />
        <div className="pointer-events-none absolute left-2 top-2 z-[5000] space-y-1 rounded-lg border border-border/70 bg-background/85 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted-foreground backdrop-blur">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-cyan-400/85" />
            <span>海上 / 陆上风电</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/85" />
            <span>集中式光伏</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-400/70" />
            <span>历史站点（GPPD 旧口径）</span>
          </div>
          <div className="pt-0.5 text-[9px] text-muted-foreground/80">圆点大小 ∝ 装机容量</div>
        </div>
      </div>

      {/* 数据说明 + 来源 */}
      <p className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[10px] leading-relaxed text-muted-foreground">
        <Landmark className="mr-0.5 h-3 w-3 text-cyan-400/70" />
        <span>数据年份：海上风电 / 光伏 2021-2025；历史站点为 WRI 2017-18 旧口径。来源：</span>
        {mainSources.map((x, i) => (
          <span key={x.s!.url}>
            {i > 0 && '、'}
            <a
              className="text-primary/80 underline-offset-2 hover:underline"
              href={x.s!.url}
              target="_blank"
              rel="noreferrer"
            >
              {x.label}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}

// ---- 场站 marker 构建（divIcon，默认图片 icon，避免 GitHub Pages/Vite 下 404） ----

function siteSize(capacityMw: number, isRecent: boolean): number {
  if (!isRecent) return 8 // 旧历史点：小灰点
  const t = Math.min(1, Math.max(0, (capacityMw - 200) / 800)) // 容量 200 -> 0, 1000 -> 1
  return Math.round(20 + t * 24) // 20 ~ 44px
}

/** 来源 -> 简洁可读标签（真实来源 + 年份，避免底部来源串过长） */
function sourceLabel(s: WindSolarSiteSource): string {
  const n = s.name ?? ''
  if (n.includes('Global Energy Monitor')) return 'Global Energy Monitor · 风电（2025）'
  if (n.includes('GPPD')) return 'WRI 全球电厂库（旧口径）'
  if (n.includes('市政府') || n.includes('能源局')) return '山东省能源局 / 行业报道（2024-25）'
  if (n.includes('中国新闻网')) return '中广核莱州 · 盐光互补（2024）'
  if (n.includes('济宁市')) return '宁德时代兖州 · 漂浮式光伏（2024）'
  if (n.includes('华能')) return '华能滨州 · 光储一体化（2025）'
  return n
}

function windGlyph(color: string) {
  // 风机：塔筒 + 轮毂 + 三叶
  return `<svg viewBox="0 0 24 24" width="56%" height="56%" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="10.9" y="12" width="2.2" height="8" rx="1.1" fill="${color}" stroke="none"/>
    <circle cx="12" cy="9" r="1.7" fill="${color}" stroke="none"/>
    <path d="M12 9V4.4"/>
    <path d="M12 9l4.1 2.5"/>
    <path d="M12 9l-4.1 2.5"/>
  </svg>`
}

function solarGlyph(color: string) {
  // 太阳：中心圆 + 发散光芒
  return `<svg viewBox="0 0 24 24" width="60%" height="60%" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="4.2"/>
    <path d="M12 2.5v2M12 19.5v2M4.3 4.3l1.5 1.5M18.2 18.2l1.5 1.5M2.5 12h2M19.5 12h2M6.2 17.8l-1.5 1.5M19.3 4.7l-1.5 1.5"/>
  </svg>`
}

function siteIcon(s: WindSolarSite, size: number): L.DivIcon {
  const isRecent = s.year != null
  const isWind = s.type === 'wind'
  let bg: string
  let border: string
  let glow: string
  let glyphColor: string
  if (!isRecent) {
    bg = 'radial-gradient(circle at 32% 30%, hsla(210 18% 62% / 0.95), hsla(215 25% 42% / 0.95))'
    border = 'hsla(210 16% 66% / 0.9)'
    glow = '0 0 6px hsla(210 12% 60% / 0.45)'
    glyphColor = '#f2f5f8'
  } else if (isWind) {
    bg = 'radial-gradient(circle at 32% 30%, hsl(187 92% 56% / 0.98), hsl(202 90% 38% / 0.96))'
    border = 'hsl(187 92% 62%)'
    glow = '0 0 14px hsl(187 92% 55% / 0.8), inset 0 0 6px hsla(187 100% 88% / 0.55)'
    glyphColor = '#02262f'
  } else {
    bg = 'radial-gradient(circle at 32% 30%, hsl(45 100% 62% / 0.98), hsl(38 90% 47% / 0.96))'
    border = 'hsl(45 100% 66%)'
    glow = '0 0 14px hsl(40 95% 55% / 0.8), inset 0 0 6px hsla(45 100% 92% / 0.5)'
    glyphColor = '#3a2400'
  }
  const glyph = isWind ? windGlyph(glyphColor) : solarGlyph(glyphColor)
  const html = `<div style="width:${size}px;height:${size}px;background:${bg};border:1.5px solid ${border};border-radius:50%;box-shadow:${glow};display:flex;align-items:center;justify-content:center;">${glyph}</div>`
  return L.divIcon({
    className: 'energy-marker',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function siteTooltip(s: WindSolarSite): string {
  const typeLabel =
    s.type === 'wind' ? (s.subtype === 'offshore' ? '海上风电' : '陆上风电') : '集中式光伏'
  const yearLine =
    s.year != null
      ? `<span style="color:#8beefc">${s.year} 年投产</span>`
      : '投产年份：旧口径（2017-18 采集）'
  const dataYear = s.sourceYear != null ? `<span>数据年份：${s.sourceYear}</span>` : ''
  return `<div style="min-width:170px">
    <div style="font-weight:600;color:#7ff1ff;margin-bottom:3px;max-width:230px;line-height:1.35">${s.name}</div>
    <div style="color:hsl(210 40% 90%)">类型：${typeLabel}<span style="color:hsl(215 20% 68%)"> · ${s.capacityMw} MW</span></div>
    <div style="color:hsl(215 20% 78%)">所在市：${s.city}</div>
    <div style="color:hsl(215 20% 78%)">${yearLine}</div>
    ${dataYear}
  </div>`
}

function buildSiteMarker(s: WindSolarSite): L.Marker {
  const isRecent = s.year != null
  const size = siteSize(s.capacityMw, isRecent)
  const marker = L.marker([s.lat, s.lng], {
    icon: siteIcon(s, size),
    riseOnHover: true,
    riseOffset: 400,
  })
  marker.bindTooltip(siteTooltip(s), {
    className: 'energy-tooltip',
    direction: 'top',
    offset: [0, -size / 2 - 4],
    opacity: 1,
  })
  return marker
}
