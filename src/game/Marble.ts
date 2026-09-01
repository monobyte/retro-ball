import * as THREE from 'three';

export const MARBLE_COLOR = new THREE.Color(1.0, 0.22, 0.85);

function glowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,120,230,0.8)');
  g.addColorStop(0.55, 'rgba(255,40,190,0.25)');
  g.addColorStop(1, 'rgba(255,40,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Builds a small neon environment and bakes it into a PMREM env map so the
 * chrome marble reflects pink/cyan bands instead of a flat colour.
 */
export function buildNeonEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07021a);
  const add = (color: number, pos: THREE.Vector3, size: [number, number], rot: THREE.Euler) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(size[0], size[1]),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    m.position.copy(pos);
    m.rotation.copy(rot);
    scene.add(m);
  };
  add(0xff2fb9, new THREE.Vector3(0, 6, -10), [30, 1.2], new THREE.Euler(0, 0, 0));
  add(0x38f5ff, new THREE.Vector3(0, 3, -10), [30, 0.6], new THREE.Euler(0, 0, 0));
  add(0x7a3cff, new THREE.Vector3(0, -6, 0), [40, 40], new THREE.Euler(-Math.PI / 2, 0, 0));
  add(0xffffff, new THREE.Vector3(6, 10, 4), [4, 4], new THREE.Euler(Math.PI / 2, 0, 0));
  add(0x38f5ff, new THREE.Vector3(-10, 4, 2), [1, 14], new THREE.Euler(0, Math.PI / 2, 0));
  add(0xff2fb9, new THREE.Vector3(10, 2, -3), [1, 10], new THREE.Euler(0, -Math.PI / 2, 0));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.04);
  pmrem.dispose();
  return rt.texture;
}

/** Visual representation of the marble: chrome shell, pink core, glow, light and trail. */
export class Marble {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;
  readonly shell: THREE.Mesh;
  private readonly core: THREE.Mesh;
  private readonly halo: THREE.Sprite;
  private readonly trail: THREE.Line;
  private readonly trailPositions: Float32Array;
  private readonly trailColors: Float32Array;
  private readonly trailCount = 40;
  private trailHead = 0;
  private trailFilled = 0;
  /** 0..1 materialisation factor used by spawn/death animations. */
  scale = 1;

  constructor(radius: number, envMap: THREE.Texture) {
    const shellMat = new THREE.MeshPhysicalMaterial({
      color: 0xd8d0ff,
      metalness: 0.95,
      roughness: 0.12,
      envMap,
      envMapIntensity: 1.6,
      emissive: MARBLE_COLOR,
      emissiveIntensity: 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), shellMat);
    this.group.add(this.shell);

    const coreMat = new THREE.MeshBasicMaterial({
      color: MARBLE_COLOR,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    coreMat.toneMapped = false;
    this.core = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.55, 24, 16), coreMat);
    this.group.add(this.core);

    const haloMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    haloMat.toneMapped = false;
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(radius * 6);
    this.group.add(this.halo);

    this.light = new THREE.PointLight(MARBLE_COLOR, 60, 14, 2);
    this.light.position.set(0, 0.3, 0);
    this.group.add(this.light);

    this.trailPositions = new Float32Array(this.trailCount * 3);
    this.trailColors = new Float32Array(this.trailCount * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.trailColors, 3));
    const trailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    trailMat.toneMapped = false;
    this.trail = new THREE.Line(geo, trailMat);
    this.trail.frustumCulled = false;
  }

  /** Objects that live in the scene root (not attached to the marble group). */
  get sceneExtras(): THREE.Object3D[] {
    return [this.trail];
  }

  setPose(pos: THREE.Vector3, quat: THREE.Quaternion): void {
    this.group.position.copy(pos);
    this.shell.quaternion.copy(quat);
  }

  update(time: number, beat: number, speed: number, maxSpeed: number): void {
    const s = this.scale;
    this.shell.scale.setScalar(s);
    this.core.scale.setScalar(s * (1 + 0.15 * beat));
    this.halo.scale.setScalar(s * 2.1 * (1 + 0.2 * beat + 0.25 * (speed / maxSpeed)));
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.3 + 0.25 * beat;
    this.light.intensity = (30 + 25 * beat) * s;
    (this.shell.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.2 + 0.3 * beat;
    this.group.visible = s > 0.01;

    // Trail ring buffer.
    const p = this.group.position;
    const i = this.trailHead * 3;
    this.trailPositions[i] = p.x;
    this.trailPositions[i + 1] = p.y;
    this.trailPositions[i + 2] = p.z;
    this.trailHead = (this.trailHead + 1) % this.trailCount;
    this.trailFilled = Math.min(this.trailFilled + 1, this.trailCount);

    // Rewrite in draw order (oldest -> newest) into the geometry.
    const pos = this.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    const col = this.trail.geometry.getAttribute('color') as THREE.BufferAttribute;
    const strength = s * Math.min(1, speed / (maxSpeed * 0.5));
    for (let k = 0; k < this.trailCount; k++) {
      const src = ((this.trailHead + k) % this.trailCount) * 3;
      const age = k / (this.trailCount - 1); // 0 oldest .. 1 newest
      pos.setXYZ(k, this.trailPositions[src]!, this.trailPositions[src + 1]!, this.trailPositions[src + 2]!);
      const a = age * age * strength * (this.trailFilled > k ? 1 : 0);
      col.setXYZ(k, MARBLE_COLOR.r * a, MARBLE_COLOR.g * a, MARBLE_COLOR.b * a);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    void time;
  }

  /** Clears the trail so respawns don't draw a streak across the level. */
  resetTrail(pos: THREE.Vector3): void {
    for (let k = 0; k < this.trailCount; k++) {
      this.trailPositions[k * 3] = pos.x;
      this.trailPositions[k * 3 + 1] = pos.y;
      this.trailPositions[k * 3 + 2] = pos.z;
    }
    this.trailFilled = 0;
  }
}
