import * as THREE from 'three';

/** Direction from the look-at target toward the camera (fixed isometric). */
export const ISO_DIR = new THREE.Vector3(1, 1.12, 1).normalize();
const CAMERA_DISTANCE = 160;

/**
 * Owns the WebGL renderer, the fixed isometric orthographic camera and the
 * main scene. Post-processing lives in PostFX and is attached separately so
 * the base renderer can be exercised on its own.
 */
export class Renderer {
  private readonly listeners = new AbortController();
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  /** World units visible vertically. */
  viewHeight = 24;
  readonly target = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement, private pixelRatioCap = 2) {
    // Canvas MSAA is off on purpose: the scene renders into the PostFX
    // composer target, which carries its own multisampling when enabled.
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    this.renderer.setClearColor(0x05010e, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 600);
    this.camera.up.set(0, 1, 0);
    this.resize();
    window.addEventListener('resize', () => { this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.pixelRatioCap)); this.resize(); }, { signal: this.listeners.signal });
  }

  dispose(): void { this.listeners.abort(); this.renderer.dispose(); }

  get aspect(): number {
    return this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
  }

  /** Renders at min(device pixel ratio, cap) and resizes the drawing buffer to match. */
  setPixelRatioCap(cap: number): void {
    this.pixelRatioCap = cap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.resize();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.updateFrustum();
  }

  updateFrustum(): void {
    const halfH = this.viewHeight / 2;
    const halfW = halfH * this.aspect;
    this.camera.left = -halfW;
    this.camera.right = halfW;
    this.camera.top = halfH;
    this.camera.bottom = -halfH;
    this.camera.updateProjectionMatrix();
  }

  /** Points the isometric camera at `target`. */
  lookAt(target: THREE.Vector3): void {
    this.target.copy(target);
    this.camera.position.copy(target).addScaledVector(ISO_DIR, CAMERA_DISTANCE);
    this.camera.lookAt(target);
  }

  /** Screen "up" and "right" directions projected onto the ground plane. */
  groundBasis(): { up: THREE.Vector3; right: THREE.Vector3 } {
    const forward = ISO_DIR.clone().negate();
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    return { up: forward, right };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
