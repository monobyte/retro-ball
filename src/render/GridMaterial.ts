import * as THREE from 'three';
import type { Tone } from '../game/LevelData';
import { SURFACES, type SurfaceId } from '../physics/Surfaces';

export interface ToneColors {
  line: THREE.Color;
  edge: THREE.Color;
  fillTop: THREE.Color;
  fillSide: THREE.Color;
}

export const TONES: Record<Tone, ToneColors> = {
  blue: {
    line: new THREE.Color(0.22, 0.6, 1.0),
    edge: new THREE.Color(1.0, 0.18, 0.78),
    fillTop: new THREE.Color(0.11, 0.05, 0.3),
    fillSide: new THREE.Color(0.05, 0.02, 0.14),
  },
  pink: {
    line: new THREE.Color(1.0, 0.3, 0.85),
    edge: new THREE.Color(0.3, 0.95, 1.0),
    fillTop: new THREE.Color(0.2, 0.04, 0.26),
    fillSide: new THREE.Color(0.08, 0.02, 0.12),
  },
  cyan: {
    line: new THREE.Color(0.25, 1.0, 1.0),
    edge: new THREE.Color(0.7, 0.35, 1.0),
    fillTop: new THREE.Color(0.05, 0.14, 0.28),
    fillSide: new THREE.Color(0.02, 0.06, 0.14),
  },
};

const VERT = /* glsl */ `
  attribute vec2 aGrid;
  varying vec2 vGrid;
  varying vec3 vWorld;
  varying vec3 vNormalW;
  void main() {
    vGrid = aGrid;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform float uBeat;
  uniform vec3 uMarblePos;
  uniform vec3 uMarbleColor;
  uniform vec3 uLineColor;
  uniform vec3 uFillTop;
  uniform vec3 uFillSide;
  uniform float uOpacity;
  uniform float uSurface;
  uniform vec3 uSurfaceFill;
  uniform vec3 uSurfaceLine;
  uniform float uOccluded;
  uniform vec3 uSightDirection;
  varying vec2 vGrid;
  varying vec3 vWorld;
  varying vec3 vNormalW;

  float gridLine(vec2 g, float width) {
    vec2 d = max(fwidth(g), vec2(1e-4));
    vec2 a = abs(fract(g - 0.5) - 0.5) / d;
    float l = min(a.x, a.y);
    return 1.0 - clamp(l - width, 0.0, 1.0);
  }

  void main() {
    // A small view through solid scenery reveals the marble without hiding hazards.
    vec3 sightOffset = vWorld - uMarblePos;
    float towardCamera = dot(sightOffset, uSightDirection);
    float sightDistance = length(sightOffset - towardCamera * uSightDirection);
    if (uOccluded > 0.5 && towardCamera > 0.65 && sightDistance < 1.05) discard;
    float top = smoothstep(0.35, 0.75, vNormalW.y);
    float line = gridLine(vGrid, 0.35);
    float subLine = gridLine(vGrid * 2.0, 0.0) * 0.18;

    vec3 fill = mix(uFillSide, uFillTop, top);
    // Fake directional shading so vertical faces read as sides.
    float shade = 0.55 + 0.45 * top;
    fill *= shade;

    float pulse = 0.55 + 0.4 * uBeat;
    vec3 lineCol = uLineColor * pulse;

    vec3 col = fill;
    col += lineCol * (line * (0.85 + 0.35 * top) + subLine * top);

    // Distinct large-scale material signatures survive the camera distance and
    // CRT treatment. These replace the base grid on special surfaces.
    if (uSurface > 0.5) {
      vec3 material = uSurfaceFill * (0.48 + 0.52 * top);
      if (uSurface < 1.5) {
        vec2 ice = vec2(vGrid.x * .18 + vGrid.y * .07, vGrid.y * .4);
        float seam = gridLine(ice, .55);
        float frost = .5 + .5 * sin(vGrid.x * .7 + sin(vGrid.y * .45));
        material += uSurfaceLine * (.07 + seam * .3 + frost * .09) * top;
      } else if (uSurface < 2.5) {
        vec2 cell = fract(vGrid * .65) - .5;
        float stud = 1.0 - smoothstep(.24, .29, length(cell));
        float highlight = 1.0 - smoothstep(.20, .27, length(cell + vec2(.05, .06)));
        material += uSurfaceLine * (stud * .17 + highlight * .12) * top;
        material += uSurfaceLine * gridLine(vGrid * .16, 1.0) * .3;
      } else {
        vec2 cellId = floor(vGrid * 2.0);
        float seed = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
        vec2 cell = fract(vGrid * 2.0) - .5;
        float pebble = 1.0 - smoothstep(.20, .40, max(abs(cell.x), abs(cell.y)));
        material *= .65 + seed * .5;
        material += uSurfaceLine * pebble * (.07 + seed * .2) * top;
        material += uSurfaceLine * gridLine(vGrid * .25, .35) * .12;
      }
      col = material;
    }

    // Neon glow from the marble reflecting off the surface.
    float dist = length(vWorld - uMarblePos);
    float glow = exp(-dist * 0.6) * 1.3;
    col += uMarbleColor * glow * (0.18 + 0.9 * line);

    // Slow travelling light band across the whole circuit.
    float band = 1.0 - abs(fract((vWorld.x + vWorld.z) * 0.035 - uTime * 0.12) - 0.5) * 2.0;
    band = pow(clamp(band, 0.0, 1.0), 6.0);
    col += lineCol * line * band * (uSurface < .5 ? .45 : .04);

    float alpha = uOpacity + (1.0 - uOpacity) * line;
    gl_FragColor = vec4(col, alpha);
  }
`;

export class GridMaterial extends THREE.ShaderMaterial {
  constructor(tone: ToneColors, opacity = 0.82, surface: SurfaceId = 'standard') {
    const profile = SURFACES[surface];
    super({
      uniforms: {
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uMarblePos: { value: new THREE.Vector3(0, -999, 0) },
        uMarbleColor: { value: new THREE.Color(1.0, 0.25, 0.85) },
        uLineColor: { value: tone.line.clone() },
        uFillTop: { value: tone.fillTop.clone() },
        uFillSide: { value: tone.fillSide.clone() },
        uOpacity: { value: opacity },
        uSurface: { value: profile.pattern },
        uSurfaceFill: { value: new THREE.Color(...profile.fill) },
        uSurfaceLine: { value: new THREE.Color(...profile.line) },
        uOccluded: { value: 0 },
        uSightDirection: { value: new THREE.Vector3(1, 1.12, 1).normalize() },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: true,
      // The neon edge lines lie on these faces. Bias the filled polygons
      // back slightly so the outlines do not compete with them for depth.
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
      side: THREE.FrontSide,
    });
  }

  setOcclusion(enabled: boolean, direction: THREE.Vector3): void {
    this.uniforms['uOccluded']!.value = enabled ? 1 : 0;
    (this.uniforms['uSightDirection']!.value as THREE.Vector3).copy(direction);
  }

  setFrame(time: number, beat: number, marblePos: THREE.Vector3): void {
    this.uniforms['uTime']!.value = time;
    this.uniforms['uBeat']!.value = beat;
    (this.uniforms['uMarblePos']!.value as THREE.Vector3).copy(marblePos);
  }
}
