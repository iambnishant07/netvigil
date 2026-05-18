import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { geoInterpolate } from 'd3-geo';
import { useEffect, useRef } from 'react';

// ─── public types ─────────────────────────────────────────────────────────────

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

interface FlyToTarget { lat: number; lng: number; zoom: number }

interface Props {
  threatMap:  ThreatMapData | undefined;
  flyTo?:     FlyToTarget | null;
  className?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const TOKEN = import.meta.env['VITE_MAPBOX_TOKEN'] as string | undefined;

const SEV_HEX: Record<string, string> = {
  critical: '#ef4444',
  high:     '#f97316',
  medium:   '#eab308',
  low:      '#22c55e',
};
const DEFAULT_HEX = '#94a3b8';

const HOME: [number, number] = [151.21, -33.87]; // Sydney [lng, lat]
const STEPS = 80; // arc interpolation resolution

// ─── internal types ───────────────────────────────────────────────────────────

interface Particle { t: number; speed: number }

interface AnimArc {
  interp:    (t: number) => [number, number];
  color:     string;
  particles: Particle[];
  originLng: number;
  originLat: number;
}

type GeoFeature     = GeoJSON.Feature;
type GeoFC          = GeoJSON.FeatureCollection;

// ─── helpers ─────────────────────────────────────────────────────────────────

function sevColor(severity: string): string {
  return SEV_HEX[severity] ?? DEFAULT_HEX;
}

function buildAnimArcs(raw: ThreatArc[]): AnimArc[] {
  return raw.map((a) => {
    const from: [number, number] = [a.from.lng, a.from.lat];
    const to:   [number, number] = [a.to.lng,   a.to.lat];
    return {
      interp:    geoInterpolate(from, to),
      color:     sevColor(a.severity),
      originLng: a.from.lng,
      originLat: a.from.lat,
      particles: [
        { t: 0.00, speed: 0.004 + Math.random() * 0.003 },
        { t: 0.33, speed: 0.004 + Math.random() * 0.003 },
        { t: 0.66, speed: 0.004 + Math.random() * 0.003 },
      ],
    };
  });
}

function fc(features: GeoFeature[]): GeoFC {
  return { type: 'FeatureCollection', features };
}

// GeoJSON FeatureCollection of great-circle LineStrings (one per arc)
function arcFC(arcs: AnimArc[], raw: ThreatArc[]): GeoFC {
  return fc(
    arcs.map((a, i) => ({
      type: 'Feature' as const,
      properties: { color: a.color, severity: raw[i]?.severity ?? 'info' },
      geometry: {
        type: 'LineString' as const,
        coordinates: Array.from({ length: STEPS + 1 }, (_, k) =>
          a.interp(k / STEPS) as [number, number]
        ),
      },
    }))
  );
}

// GeoJSON FeatureCollection of current particle positions
function particleFC(arcs: AnimArc[]): GeoFC {
  return fc(
    arcs.flatMap((a) =>
      a.particles.map((p): GeoFeature => {
        const [lng, lat] = a.interp(p.t);
        return {
          type: 'Feature' as const,
          properties: { color: a.color },
          geometry: { type: 'Point' as const, coordinates: [lng, lat] },
        };
      })
    )
  );
}

// Unique origin points (deduplicated by coordinate)
function originFC(arcs: AnimArc[]): GeoFC {
  const seen = new Set<string>();
  return fc(
    arcs
      .filter((a) => {
        const key = `${a.originLng},${a.originLat}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((a): GeoFeature => ({
        type: 'Feature' as const,
        properties: { color: a.color },
        geometry: { type: 'Point' as const, coordinates: [a.originLng, a.originLat] },
      }))
  );
}

// ─── map layer setup (called once on 'load') ──────────────────────────────────

function setupLayers(map: mapboxgl.Map): void {
  const empty = fc([]);

  map.addSource('threat-arcs',      { type: 'geojson', data: empty });
  map.addSource('threat-particles', { type: 'geojson', data: empty });
  map.addSource('threat-origins',   { type: 'geojson', data: empty });
  map.addSource('threat-home', {
    type: 'geojson',
    data: {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Point' as const, coordinates: HOME },
    },
  });

  // Faint great-circle arc trails
  map.addLayer({
    id: 'arc-lines', type: 'line', source: 'threat-arcs',
    paint: {
      'line-color':   ['get', 'color'],
      'line-opacity': 0.28,
      'line-width':   1,
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  // Animated particle dots
  map.addLayer({
    id: 'particles', type: 'circle', source: 'threat-particles',
    paint: {
      'circle-radius':  3,
      'circle-color':   ['get', 'color'],
      'circle-blur':    0.25,
      'circle-opacity': 0.92,
    },
  });

  // Origin pulse ring (radius animated each frame via setPaintProperty)
  map.addLayer({
    id: 'origin-pulse', type: 'circle', source: 'threat-origins',
    paint: {
      'circle-radius':         6,
      'circle-color':          'transparent',
      'circle-stroke-width':   1.5,
      'circle-stroke-color':   ['get', 'color'],
      'circle-stroke-opacity': 0.6,
    },
  });

  // Origin core dot
  map.addLayer({
    id: 'origin-core', type: 'circle', source: 'threat-origins',
    paint: {
      'circle-radius': 2.5,
      'circle-color':  ['get', 'color'],
    },
  });

  // Sydney — outer pulse ring 1
  map.addLayer({
    id: 'home-pulse-1', type: 'circle', source: 'threat-home',
    paint: {
      'circle-radius':         8,
      'circle-color':          'transparent',
      'circle-stroke-width':   1.5,
      'circle-stroke-color':   '#00c8e0',
      'circle-stroke-opacity': 0.5,
    },
  });

  // Sydney — outer pulse ring 2 (counter-phase)
  map.addLayer({
    id: 'home-pulse-2', type: 'circle', source: 'threat-home',
    paint: {
      'circle-radius':         8,
      'circle-color':          'transparent',
      'circle-stroke-width':   1.5,
      'circle-stroke-color':   '#00c8e0',
      'circle-stroke-opacity': 0.5,
    },
  });

  // Sydney — static inner ring
  map.addLayer({
    id: 'home-ring', type: 'circle', source: 'threat-home',
    paint: {
      'circle-radius':         5,
      'circle-color':          'transparent',
      'circle-stroke-width':   1.2,
      'circle-stroke-color':   '#00c8e0',
      'circle-stroke-opacity': 0.85,
    },
  });

  // Sydney — core dot with icon-size scaling (new Mapbox capability)
  map.addLayer({
    id: 'home-core', type: 'circle', source: 'threat-home',
    paint: {
      'circle-radius':  3.5,
      'circle-color':   '#00c8e0',
      'circle-opacity': 1,
    },
  });
}

function setData(map: mapboxgl.Map, id: string, data: GeoFC): void {
  (map.getSource(id) as mapboxgl.GeoJSONSource).setData(data);
}

// ─── component ────────────────────────────────────────────────────────────────

export function ThreatMap({ threatMap, flyTo, className = 'h-80' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const rafRef       = useRef<number | null>(null);
  const frameRef     = useRef(0);
  const arcsRef      = useRef<AnimArc[]>([]);
  const rawArcsRef   = useRef<ThreatArc[]>([]);
  const loadedRef    = useRef(false);

  // Fly to a target location when requested
  useEffect(() => {
    if (!flyTo || !mapRef.current || !loadedRef.current) return;
    mapRef.current.flyTo({
      center:    [flyTo.lng, flyTo.lat],
      zoom:       flyTo.zoom,
      duration:   1500,
      essential:  true,
    });
  }, [flyTo]);

  // Keep animation arc state in sync with incoming prop
  useEffect(() => {
    rawArcsRef.current = threatMap?.arcs ?? [];
    arcsRef.current    = buildAnimArcs(rawArcsRef.current);
    if (loadedRef.current && mapRef.current) {
      const m = mapRef.current;
      setData(m, 'threat-arcs',    arcFC(arcsRef.current, rawArcsRef.current));
      setData(m, 'threat-origins', originFC(arcsRef.current));
    }
  }, [threatMap]);

  // Map lifecycle — mount once, read everything from refs
  useEffect(() => {
    if (!TOKEN || !containerRef.current) return;

    mapboxgl.accessToken = TOKEN;

    const map = new mapboxgl.Map({
      container:        containerRef.current,
      style:            'mapbox://styles/mapbox/dark-v11',
      projection:       'equalEarth',
      center:           [20, 10],
      zoom:             0.9,
      interactive:      true,
      scrollZoom:       false,   // don't hijack page scroll
      dragRotate:       false,
      attributionControl: false,
      logoPosition:     'bottom-right',
    });

    mapRef.current = map;

    map.on('load', () => {
      loadedRef.current = true;
      setupLayers(map);

      // Push current arc data immediately (might have arrived before map loaded)
      setData(map, 'threat-arcs',    arcFC(arcsRef.current, rawArcsRef.current));
      setData(map, 'threat-origins', originFC(arcsRef.current));

      const animate = () => {
        const frame = frameRef.current;

        // Advance particles and push updated positions to Mapbox
        for (const arc of arcsRef.current) {
          for (const p of arc.particles) p.t = (p.t + p.speed) % 1;
        }
        setData(map, 'threat-particles', particleFC(arcsRef.current));

        // Pulse origin rings
        const originR   = 3  + ((Math.sin(frame * 0.06) + 1) / 2) * 9;
        const originAlp = 0.8 - ((Math.sin(frame * 0.06) + 1) / 2) * 0.65;
        map.setPaintProperty('origin-pulse', 'circle-radius',         originR);
        map.setPaintProperty('origin-pulse', 'circle-stroke-opacity', originAlp);

        // Pulse home rings — counter-phase for continuous breathing effect
        const p1 = (Math.sin(frame * 0.045) + 1) / 2;
        const p2 = (Math.sin(frame * 0.045 + Math.PI) + 1) / 2;
        map.setPaintProperty('home-pulse-1', 'circle-radius',         5 + p1 * 14);
        map.setPaintProperty('home-pulse-1', 'circle-stroke-opacity', 0.55 - p1 * 0.50);
        map.setPaintProperty('home-pulse-2', 'circle-radius',         5 + p2 * 14);
        map.setPaintProperty('home-pulse-2', 'circle-stroke-opacity', 0.55 - p2 * 0.50);

        frameRef.current  += 1;
        rafRef.current     = requestAnimationFrame(animate);
      };

      rafRef.current = requestAnimationFrame(animate);
    });

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      loadedRef.current  = false;
      mapRef.current     = null;
      map.remove();
    };
  }, []); // stable — everything read from refs

  if (!TOKEN) {
    return (
      <div
        className={`${className} w-full rounded-sm overflow-hidden bg-[#0f172a] flex items-center justify-center`}
        aria-label="World threat map"
      >
        <p className="text-xs text-slate-600">Set VITE_MAPBOX_TOKEN to enable the threat map</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`${className} w-full rounded-sm overflow-hidden`}
      aria-label="World threat map"
    />
  );
}
