import * as THREE from 'three';

// Soft glowing point sprites. Positions ease toward `target` each frame so
// layer outputs flow smoothly when weights change or units are added.

const VERT = /* glsl */ `
attribute vec3 aColor;
varying vec3 vColor;
uniform float uSize;
uniform float uPxRatio;
uniform float uSizeScale;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * uSizeScale * uPxRatio * (3.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = /* glsl */ `
precision mediump float;
varying vec3 vColor;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float core = smoothstep(0.30, 0.12, d);
  float glow = smoothstep(0.5, 0.08, d);
  float a = core * 0.85 + glow * 0.22;
  if (a < 0.02) discard;
  gl_FragColor = vec4(vColor, a);
}
`;

export class PointCloud {
  readonly object: THREE.Points;
  private readonly n: number;
  private readonly pos: Float32Array;
  private readonly target: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colorAttr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(n: number, size = 10) {
    this.n = n;
    this.pos = new Float32Array(n * 3);
    this.target = new Float32Array(n * 3);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colorAttr);

    this.material = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: size }, uPxRatio: { value: 1 }, uSizeScale: { value: 1 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.object = new THREE.Points(geo, this.material);
    this.object.frustumCulled = false;
  }

  setPixelRatio(r: number): void {
    this.material.uniforms.uPxRatio.value = r;
  }

  /** Shrink points when the cloud renders in a small viewport (minimap). */
  setSizeScale(s: number): void {
    this.material.uniforms.uSizeScale.value = s;
  }

  setTargets(a: Float32Array): void {
    this.target.set(a.subarray(0, this.n * 3));
  }

  snap(): void {
    this.pos.set(this.target);
    this.posAttr.needsUpdate = true;
  }

  setColors(y: Uint8Array, c0: THREE.Color, c1: THREE.Color): void {
    const arr = this.colorAttr.array as Float32Array;
    for (let i = 0; i < this.n; i++) {
      const c = y[i] === 0 ? c0 : c1;
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    this.colorAttr.needsUpdate = true;
  }

  /** Ease displayed positions toward targets; k in (0, 1], 1 = instant. */
  tick(k: number): void {
    const p = this.pos, t = this.target;
    for (let i = 0; i < p.length; i++) {
      p[i] += (t[i] - p[i]) * k;
    }
    this.posAttr.needsUpdate = true;
  }
}
