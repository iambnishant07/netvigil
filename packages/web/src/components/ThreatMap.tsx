import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef } from 'react';

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
  /** Tailwind / class for the outer wrapper height, e.g. "h-80" */
  className?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
if (TOKEN) mapboxgl.accessToken = TOKEN;

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
};

const SEVERITIES = Object.keys(SEV_COLOR) as Array<keyof typeof SEV_COLOR>;

// Animated dasharray sequence (Mapbox flowing-line technique)
const DASH_SEQUENCE: number[][] = [
  [0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5],
  [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0],
  [0, 0.5, 3, 3.5], [0, 1, 3, 3], [0, 1.5, 3, 2.5],
  [0, 2, 3, 2], [0, 2.5, 3, 1.5], [0, 3, 3, 1], [0, 3.5, 3, 0.5], [0, 4, 3],
];

// ─── great-circle path ────────────────────────────────────────────────────────

function greatCirclePath(
  from: [number, number],
  to:   [number, number],
  steps = 60,
): [number, number][] {
  const toR = (d: number) => (d * Math.PI) / 180;
  const toD = (r: number) => (r * 180) / Math.PI;

  const φ1 = toR(from[1]), λ1 = toR(from[0]);
  const φ2 = toR(to[1]),   λ2 = toR(to[0]);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
    ),
  );

  if (d === 0) return [from, to];

  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    pts.push([toD(Math.atan2(y, x)), toD(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return pts;
}

// ─── GeoJSON helpers ──────────────────────────────────────────────────────────

interface GeoJSONLineString {
  type: 'LineString';
  coordinates: [number, number][];
}
interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, unknown>;
  geometry: GeoJSONLineString;
}
interface GeoJSONCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

function buildCollection(arcs: ThreatArc[], severity: string): GeoJSONCollection {
  return {
    type: 'FeatureCollection',
    features: arcs
      .filter((a) => a.severity === severity)
      .map((arc) => ({
        type: 'Feature',
        properties: { country: arc.sourceCountry, count: arc.count },
        geometry: {
          type: 'LineString',
          coordinates: greatCirclePath(
            [arc.from.lng, arc.from.lat],
            [arc.to.lng,   arc.to.lat],
          ),
        },
      })),
  };
}

// ─── map-level helpers ────────────────────────────────────────────────────────

function setupLayers(map: mapboxgl.Map) {
  SEVERITIES.forEach((sev) => {
    map.addSource(`arcs-${sev}`, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id:     `arcs-${sev}`,
      type:   'line',
      source: `arcs-${sev}`,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color':   SEV_COLOR[sev] as string,
        'line-width':   2,
        'line-opacity': 0.85,
      },
    });

    // Source-country dots
    map.addSource(`dots-${sev}`, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
    map.addLayer({
      id:     `dots-${sev}`,
      type:   'circle',
      source: `dots-${sev}`,
      paint: {
        'circle-radius':       4,
        'circle-color':        SEV_COLOR[sev] as string,
        'circle-opacity':      0.9,
        'circle-stroke-width': 1,
        'circle-stroke-color': '#000',
      },
    });
  });
}

function updateData(map: mapboxgl.Map, arcs: ThreatArc[]) {
  SEVERITIES.forEach((sev) => {
    const arcSrc = map.getSource(`arcs-${sev}`) as mapboxgl.GeoJSONSource | undefined;
    arcSrc?.setData(buildCollection(arcs, sev));

    const dotSrc = map.getSource(`dots-${sev}`) as mapboxgl.GeoJSONSource | undefined;
    if (dotSrc) {
      const dots: GeoJSONCollection = {
        type: 'FeatureCollection',
        features: arcs
          .filter((a) => a.severity === sev)
          .map((arc) => ({
            type: 'Feature',
            properties: { country: arc.sourceCountry },
            geometry: { type: 'LineString', coordinates: [[arc.from.lng, arc.from.lat]] },
          })),
      };
      dotSrc.setData(dots);
    }
  });
}

function addHomeMarker(map: mapboxgl.Map, lng: number, lat: number) {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Home location');
  el.style.cssText = [
    'width:14px', 'height:14px', 'border-radius:50%',
    'background:#00c8e0', 'border:2px solid #fff',
    'box-shadow:0 0 0 4px rgba(0,200,224,0.3)',
    'animation:homePulse 2s infinite',
  ].join(';');
  new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
}

// ─── component ────────────────────────────────────────────────────────────────

export function ThreatMap({ threatMap, className = 'h-80' }: Props) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const mapRef        = useRef<mapboxgl.Map | null>(null);
  const animRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  // Ref so the load callback always sees the latest data (avoids stale closure)
  const threatMapRef  = useRef<ThreatMapData | undefined>(threatMap);

  // Keep ref in sync with prop
  useEffect(() => { threatMapRef.current = threatMap; }, [threatMap]);

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;

    const map = new mapboxgl.Map({
      container:          containerRef.current,
      style:              'mapbox://styles/mapbox/dark-v11',
      center:             [134, -28],
      zoom:               1.5,
      projection:         { name: 'naturalEarth' },
      attributionControl: false,
    });

    mapRef.current = map;

    map.on('load', () => {
      const style = map.getStyle();
      style?.layers?.forEach((layer) => {
        const id = layer.id;
        if (
          id.startsWith('road') || id.startsWith('transit') ||
          id.startsWith('poi')  || id.includes('label')
        ) {
          map.setLayoutProperty(id, 'visibility', 'none');
        }
      });

      addHomeMarker(map, 151.21, -33.87);
      setupLayers(map);
      // Read from ref so we get whatever data has arrived by the time tiles load
      if (threatMapRef.current) updateData(map, threatMapRef.current.arcs);

      let step = 0;
      animRef.current = setInterval(() => {
        SEVERITIES.forEach((sev) => {
          if (map.getLayer(`arcs-${sev}`)) {
            map.setPaintProperty(`arcs-${sev}`, 'line-dasharray', DASH_SEQUENCE[step]);
          }
        });
        step = (step + 1) % DASH_SEQUENCE.length;
      }, 80);
    });

    return () => {
      if (animRef.current !== null) clearInterval(animRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push fresh data whenever the prop updates (handles data arriving after map loads)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !threatMap || !map.isStyleLoaded()) return;
    updateData(map, threatMap.arcs);
  }, [threatMap]);

  if (!TOKEN) {
    return (
      <div className={`${className} flex items-center justify-center text-sm text-slate-500`}>
        Set VITE_MAPBOX_TOKEN to enable the live threat map
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${className} w-full rounded-sm`}
      aria-label="World threat map"
    />
  );
}
