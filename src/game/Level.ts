import * as THREE from 'three';
import { SURFACES, type SurfaceId } from '../physics/Surfaces';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { GridMaterial, TONES } from '../render/GridMaterial';
import type { LevelDefinition, Piece, Tone } from './LevelData';

/** A solid box in world space: shared by rendering and physics. */
export interface BoxSpec {
  center: THREE.Vector3;
  /** Full extents. */
  size: THREE.Vector3;
  quat: THREE.Quaternion;
  tone: Tone;
  kind: 'slab' | 'ramp' | 'wall';
  surface: SurfaceId;
}

export interface LabelSpec {
  text: string;
  position: THREE.Vector3;
  width: number;
}

const DEFAULT_THICKNESS = 1.0;

/** Converts a piece into a box in world space, or null for non-solid pieces. */
export function pieceToBox(p: Piece): BoxSpec | null {
  switch (p.kind) {
    case 'slab': {
      const t = p.thick ?? DEFAULT_THICKNESS;
      return {
        center: new THREE.Vector3(p.x, p.y - t / 2, p.z),
        size: new THREE.Vector3(p.w, t, p.d),
        quat: new THREE.Quaternion(),
        tone: p.tone ?? 'blue',
        kind: 'slab', surface: p.surface ?? 'standard',
      };
    }
    case 'wall': {
      return {
        center: new THREE.Vector3(p.x, p.y + p.h / 2, p.z),
        size: new THREE.Vector3(p.w, p.h, p.d),
        quat: new THREE.Quaternion(),
        tone: p.tone ?? 'blue',
        kind: 'wall', surface: 'standard',
      };
    }
    case 'ramp': {
      const t = p.thick ?? DEFAULT_THICKNESS;
      const rise = p.y1 - p.y0;
      const angle = Math.atan2(rise, p.len);
      const slopeLen = Math.hypot(p.len, rise);
      const quat = new THREE.Quaternion();
      let size: THREE.Vector3;
      switch (p.dir) {
        case '+x':
          quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);
          size = new THREE.Vector3(slopeLen, t, p.w);
          break;
        case '-x':
          quat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angle);
          size = new THREE.Vector3(slopeLen, t, p.w);
          break;
        case '+z':
          quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -angle);
          size = new THREE.Vector3(p.w, t, slopeLen);
          break;
        case '-z':
          quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
          size = new THREE.Vector3(p.w, t, slopeLen);
          break;
      }
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
      const topCenter = new THREE.Vector3(p.x, (p.y0 + p.y1) / 2, p.z);
      const center = topCenter.addScaledVector(normal, -t / 2);
      return { center, size, quat, tone: p.tone ?? 'blue', kind: 'ramp', surface: p.surface ?? 'standard' };
    }
    default:
      return null;
  }
}

/** Box geometry with a per-vertex `aGrid` attribute measured in world tiles. */
export function gridBoxGeometry(size: THREE.Vector3): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  const grid = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    let su: number;
    let sv: number;
    if (nx > 0.5) {
      su = size.z;
      sv = size.y;
    } else if (ny > 0.5) {
      su = size.x;
      sv = size.z;
    } else {
      su = size.x;
      sv = size.y;
    }
    grid[i * 2] = uv.getX(i) * su;
    grid[i * 2 + 1] = uv.getY(i) * sv;
  }
  geo.setAttribute('aGrid', new THREE.BufferAttribute(grid, 2));
  return geo;
}

/** 12 edge segments of a transformed box, as a flat position array. */
function boxEdgeSegments(box: BoxSpec): number[] {
  const h = box.size.clone().multiplyScalar(0.5);
  const corner = (sx: number, sy: number, sz: number) =>
    new THREE.Vector3(sx * h.x, sy * h.y, sz * h.z).applyQuaternion(box.quat).add(box.center);
  const c = [
    corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1),
    corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1),
  ];
  const pairs: Array<[number, number]> = [
    [0, 1], [1, 2], [2, 3], [3, 0],
    [4, 5], [5, 6], [6, 7], [7, 4],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const out: number[] = [];
  for (const [a, b] of pairs) {
    const pa = c[a]!;
    const pb = c[b]!;
    out.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
  }
  return out;
}

/**
 * Static level geometry: one merged mesh + one fat-line edge set per tone.
 */
export class LevelGeometry {
  readonly group = new THREE.Group();
  readonly materials: GridMaterial[] = [];
  readonly edgeMaterials: LineMaterial[] = [];
  readonly boxes: BoxSpec[] = [];
  readonly labels: LabelSpec[] = [];
  readonly bounds = new THREE.Box3();

  constructor(def: LevelDefinition) {
    const byTone = new Map<string, { geos: THREE.BufferGeometry[]; edges: number[]; tone: Tone; surface: SurfaceId }>();
    for (const piece of def.pieces) {
      const box = pieceToBox(piece);
      if (box) {
        this.boxes.push(box);
        const key = `${box.tone}:${box.surface}`;
        let bucket = byTone.get(key);
        if (!bucket) {
          bucket = { geos: [], edges: [], tone: box.tone, surface: box.surface };
          byTone.set(key, bucket);
        }
        const geo = gridBoxGeometry(box.size);
        const m = new THREE.Matrix4().compose(box.center, box.quat, new THREE.Vector3(1, 1, 1));
        geo.applyMatrix4(m);
        if (piece.kind === 'slab' && piece.gridOrigin) {
          // Keep the floor grid continuous across fractional cutout boundaries.
          const pos = geo.getAttribute('position');
          const normal = geo.getAttribute('normal');
          const grid = geo.getAttribute('aGrid');
          for (let i = 0; i < pos.count; i++) {
            if (normal.getY(i) > 0.5) {
              grid.setXY(i, pos.getX(i) - piece.gridOrigin.x, pos.getZ(i) - piece.gridOrigin.z);
            }
          }
        }
        bucket.geos.push(geo);
        bucket.edges.push(...boxEdgeSegments(box));
        this.bounds.expandByObject(new THREE.Mesh(geo));
      }
      if (piece.kind === 'slab' && piece.label) {
        this.labels.push({
          text: piece.label,
          position: new THREE.Vector3(piece.x, piece.y + 0.02, piece.z),
          width: Math.min(piece.w, piece.d) * 0.7,
        });
      }
    }

    for (const bucket of byTone.values()) {
      const { tone } = bucket;
      const merged = mergeGeometries(bucket.geos, false);
      for (const geometry of bucket.geos) geometry.dispose();
      if (!merged) continue;
      const mat = new GridMaterial(TONES[tone], .82, bucket.surface);
      this.materials.push(mat);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.renderOrder = 1;
      this.group.add(mesh);

      const lineGeo = new LineSegmentsGeometry();
      lineGeo.setPositions(bucket.edges);
      const lineMat = new LineMaterial({
        color: bucket.surface === 'standard' ? TONES[tone].edge.getHex() : new THREE.Color(...SURFACES[bucket.surface].line).getHex(),
        linewidth: 2.2,
        worldUnits: false,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      lineMat.toneMapped = false;
      this.edgeMaterials.push(lineMat);
      const lines = new LineSegments2(lineGeo, lineMat);
      lines.renderOrder = 2;
      this.group.add(lines);
    }
  }

  setResolution(w: number, h: number): void {
    for (const m of this.edgeMaterials) m.resolution.set(w, h);
  }

  setOcclusion(enabled: boolean, direction: THREE.Vector3): void {
    for (const material of this.materials) material.setOcclusion(enabled, direction);
  }

  setFrame(time: number, beat: number, marblePos: THREE.Vector3): void {
    for (const m of this.materials) m.setFrame(time, beat, marblePos);
    for (const m of this.edgeMaterials) {
      m.opacity = Math.min(1, 0.72 + 0.28 * beat);
    }
  }
}
