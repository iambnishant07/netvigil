import { feature } from 'topojson-client';
import {
  geoNaturalEarth1,
  geoPath,
  geoGraticule,
  geoInterpolate,
  type GeoPermissibleObjects,
} from 'd3-geo';
import { useEffect, useRef } from 'react';
import worldTopo from 'world-atlas/countries-110m.json';

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

interface Props {
  threatMap: ThreatMapData | undefined;
  className?: string;
}

// ─── constants ────────────────────────────────────────────────────────────────

const SEV_COLOR: Record<string, [number, number, number]> = {
  critical: [239,  68,  68],   // red-500
  high:     [249, 115,  22],   // orange-500
  medium:   [234, 179,   8],   // yellow-500
  low:      [ 34, 197,  94],   // green-500
};
const DEFAULT_RGB: [number, number, number] = [148, 163, 184]; // slate-400

const HOME: [number, number] = [151.21, -33.87]; // Sydney [lng, lat]

// Pre-parse world land geometry once (module-level, not per render)
// world-atlas always exports 'land'; non-null assertion is safe here
const LAND = feature(worldTopo, worldTopo.objects['land']!) as GeoPermissibleObjects;
const GRATICULE = geoGraticule()() as GeoPermissibleObjects;

// ─── internal animation types ─────────────────────────────────────────────────

interface Particle { t: number; speed: number }

interface AnimArc {
  // d3 great-circle interpolator: t ∈ [0,1] → [lng, lat]
  interp: (t: number) => [number, number];
  rgb: [number, number, number];
  particles: Particle[];
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildAnimArcs(arcs: ThreatArc[]): AnimArc[] {
  return arcs.map((a) => {
    const from: [number, number] = [a.from.lng, a.from.lat];
    const to:   [number, number] = [a.to.lng,   a.to.lat];
    const rgb = SEV_COLOR[a.severity] ?? DEFAULT_RGB;
    const interp = geoInterpolate(from, to);
    // 3 staggered particles per arc
    const particles: Particle[] = [
      { t: 0.00, speed: 0.0035 + Math.random() * 0.003 },
      { t: 0.33, speed: 0.0035 + Math.random() * 0.003 },
      { t: 0.66, speed: 0.0035 + Math.random() * 0.003 },
    ];
    return { interp, rgb, particles };
  });
}

// ─── component ────────────────────────────────────────────────────────────────

export function ThreatMap({ threatMap, className = 'h-80' }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number | null>(null);
  const arcsRef    = useRef<AnimArc[]>([]);
  const frameRef   = useRef(0);

  // Rebuild animation arcs when data changes
  useEffect(() => {
    arcsRef.current = buildAnimArcs(threatMap?.arcs ?? []);
  }, [threatMap]);

  // Resize canvas to fill its container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  // Animation loop — runs once, reads from refs
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) { rafRef.current = requestAnimationFrame(draw); return; }

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) { rafRef.current = requestAnimationFrame(draw); return; }

      const proj = geoNaturalEarth1()
        .scale(w / 6.3)
        .translate([w / 2, h / 2]);
      const pathGen = geoPath(proj, ctx);

      // ── background ────────────────────────────────────────────────────────
      ctx.fillStyle = '#06101e';
      ctx.fillRect(0, 0, w, h);

      // ── graticule (faint cyan grid) ───────────────────────────────────────
      ctx.beginPath();
      pathGen(GRATICULE);
      ctx.strokeStyle = 'rgba(0,200,224,0.05)';
      ctx.lineWidth = 0.4;
      ctx.stroke();

      // ── land ──────────────────────────────────────────────────────────────
      ctx.beginPath();
      pathGen(LAND);
      ctx.fillStyle = '#0c1c30';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,200,224,0.22)';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // ── arcs + particles ──────────────────────────────────────────────────
      const frame = frameRef.current;

      for (const arc of arcsRef.current) {
        const [r, g, b] = arc.rgb;

        // Faint full arc path
        ctx.beginPath();
        let first = true;
        for (let i = 0; i <= 80; i++) {
          const pt = proj(arc.interp(i / 80));
          if (!pt) continue;
          if (first) { ctx.moveTo(pt[0], pt[1]); first = false; }
          else ctx.lineTo(pt[0], pt[1]);
        }
        ctx.strokeStyle = `rgba(${r},${g},${b},0.18)`;
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Particles with glowing tails
        for (const p of arc.particles) {
          p.t = (p.t + p.speed) % 1;

          // Trail: 7 dots, newest brightest
          for (let tail = 6; tail >= 0; tail--) {
            const tSample = Math.max(0, p.t - tail * 0.018);
            const pt = proj(arc.interp(tSample));
            if (!pt) continue;
            const alpha = (1 - tail / 7) * 0.95;
            const radius = tail === 0 ? 2.8 : 2.8 - tail * 0.3;
            if (tail === 0) {
              ctx.shadowColor = `rgb(${r},${g},${b})`;
              ctx.shadowBlur  = 10;
            }
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], Math.max(0.4, radius), 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
            ctx.fill();
            if (tail === 0) ctx.shadowBlur = 0;
          }
        }

        // Pulsing origin ring
        const srcPt = proj(arc.interp(0));
        if (srcPt) {
          const pulse = (Math.sin(frame * 0.06) + 1) / 2;
          ctx.beginPath();
          ctx.arc(srcPt[0], srcPt[1], 3 + pulse * 7, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${r},${g},${b},${0.7 - pulse * 0.6})`;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(srcPt[0], srcPt[1], 2.2, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.shadowColor = `rgb(${r},${g},${b})`;
          ctx.shadowBlur  = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // ── home target (Sydney) ──────────────────────────────────────────────
      const homePt = proj(HOME);
      if (homePt) {
        const p1 = (Math.sin(frame * 0.045) + 1) / 2;
        const p2 = (Math.sin(frame * 0.045 + Math.PI) + 1) / 2;

        // Two counter-phase rings for continuous pulse effect
        for (const pulse of [p1, p2]) {
          ctx.beginPath();
          ctx.arc(homePt[0], homePt[1], 5 + pulse * 14, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(0,200,224,${0.55 - pulse * 0.5})`;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
        // Static inner ring
        ctx.beginPath();
        ctx.arc(homePt[0], homePt[1], 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(0,200,224,0.8)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        // Core dot
        ctx.beginPath();
        ctx.arc(homePt[0], homePt[1], 3, 0, Math.PI * 2);
        ctx.fillStyle  = '#00c8e0';
        ctx.shadowColor = '#00c8e0';
        ctx.shadowBlur  = 12;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      frameRef.current += 1;
      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, []); // stable — reads everything from refs

  return (
    <div className={`${className} w-full rounded-sm overflow-hidden bg-[#06101e]`} aria-label="World threat map">
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
