import Globe, { type GlobeMethods } from 'react-globe.gl';
import { useEffect, useRef, useState } from 'react';

// ─── types ────────────────────────────────────────────────────────────────────

export interface ThreatArc {
  from: { lat: number; lng: number };
  to:   { lat: number; lng: number };
  count: number;
  severity: string;
  sourceCountry: string;
}

export interface ThreatMapData {
  center: { lat: number; lng: number };
  arcs: ThreatArc[];
}

interface Props {
  threatMap: ThreatMapData | undefined;
  className?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
};

// ─── internal globe data shapes ───────────────────────────────────────────────

interface GArc {
  srcLat: number; srcLng: number;
  dstLat: number; dstLng: number;
  color: [string, string];
}

interface GPoint {
  lat: number; lng: number;
  color: string;
  size: number;
}

interface GRing {
  lat: number; lng: number;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function toGlobeArcs(arcs: ThreatArc[]): GArc[] {
  return arcs.map((a) => {
    const c = SEV_COLOR[a.severity] ?? '#94a3b8';
    return {
      srcLat: a.from.lat, srcLng: a.from.lng,
      dstLat: a.to.lat,   dstLng: a.to.lng,
      color: [c, 'rgba(0,200,224,0.9)'],
    };
  });
}

function toGlobePoints(arcs: ThreatArc[]): GPoint[] {
  return arcs.map((a) => ({
    lat:   a.from.lat,
    lng:   a.from.lng,
    color: SEV_COLOR[a.severity] ?? '#94a3b8',
    size:  Math.min(0.8, 0.3 + a.count * 0.02),
  }));
}

// ─── component ────────────────────────────────────────────────────────────────

const HOME_RINGS: GRing[] = [{ lat: -33.87, lng: 151.21 }];

// CDN textures bundled with three-globe
const EARTH_IMG = '//unpkg.com/three-globe/example/img/earth-dark.jpg';
const SKY_IMG   = '//unpkg.com/three-globe/example/img/night-sky.png';

export function ThreatMap({ threatMap, className = 'h-80' }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const globeRef   = useRef<GlobeMethods>();
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Track container size for responsive globe
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => setDims({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();
    return () => ro.disconnect();
  }, []);

  // Set initial camera + enable auto-rotate once the globe is ready
  const onGlobeReady = () => {
    const g = globeRef.current;
    if (!g) return;
    g.pointOfView({ lat: -20, lng: 133, altitude: 2.2 }, 0);
    const ctrl = g.controls();
    ctrl.autoRotate      = true;
    ctrl.autoRotateSpeed = 0.4;
  };

  const arcs   = toGlobeArcs(threatMap?.arcs  ?? []);
  const points = toGlobePoints(threatMap?.arcs ?? []);

  return (
    <div
      ref={wrapperRef}
      className={`${className} w-full rounded-sm overflow-hidden bg-navy-bg`}
      aria-label="World threat map"
    >
      {dims.w > 0 && (
        <Globe
          ref={globeRef}
          width={dims.w}
          height={dims.h}
          onGlobeReady={onGlobeReady}
          backgroundColor="rgba(0,0,0,0)"
          backgroundImageUrl={SKY_IMG}
          globeImageUrl={EARTH_IMG}
          atmosphereColor="#00c8e0"
          atmosphereAltitude={0.18}
          enablePointerInteraction={true}
          // Attack arcs
          arcsData={arcs}
          arcColor={(d: object) => (d as GArc).color}
          arcAltitude={0.35}
          arcStroke={0.6}
          arcDashLength={0.45}
          arcDashGap={0.2}
          arcDashAnimateTime={1800}
          // Source location dots
          pointsData={points}
          pointColor={(d: object) => (d as GPoint).color}
          pointAltitude={0.01}
          pointRadius={(d: object) => (d as GPoint).size}
          // Pulsing ring at Sydney (home)
          ringsData={HOME_RINGS}
          ringColor={() => '#00c8e0'}
          ringMaxRadius={4}
          ringPropagationSpeed={1.5}
          ringRepeatPeriod={1000}
        />
      )}
    </div>
  );
}
