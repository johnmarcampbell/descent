import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// One fullscreen WebGL canvas, three scissored viewports whose rects follow
// three DOM cells. Each viewport has its own scene, camera, and orbit controls
// (bound to the cell element, so pointer routing is free).

export interface View {
  index: number;
  el: HTMLElement;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

const BASE_FOV = 36;

export class Viewports {
  readonly renderer: THREE.WebGLRenderer;
  readonly views: View[] = [];

  constructor(canvas: HTMLCanvasElement, els: HTMLElement[]) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor(0x000000, 0);

    els.forEach((el, index) => {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.1, 60);
      camera.position.set(3.2, 2.2, 3.2);

      const controls = new OrbitControls(camera, el);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.enablePan = false;
      controls.minDistance = 1.6;
      controls.maxDistance = 10;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.5;

      addScaffold(scene, index);
      this.views.push({ index, el, scene, camera, controls });
    });

    window.addEventListener('resize', () => {
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  render(): void {
    const r = this.renderer;
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);

    // Largest rect first so an overlapping inset (minimap) paints on top.
    const visible = this.views
      .map((v) => ({ v, rect: v.el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width >= 2 && rect.height >= 2)
      .sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);

    for (const { v, rect } of visible) {
      const bottom = window.innerHeight - rect.bottom;
      r.setViewport(rect.left, bottom, rect.width, rect.height);
      r.setScissor(rect.left, bottom, rect.width, rect.height);

      const aspect = rect.width / rect.height;
      if (Math.abs(v.camera.aspect - aspect) > 1e-3) {
        v.camera.aspect = aspect;
        // Keep the *horizontal* field of view from collapsing in tall, narrow
        // cells — widen the vertical fov to compensate.
        v.camera.fov = aspect >= 1
          ? BASE_FOV
          : Math.min(
              75,
              THREE.MathUtils.radToDeg(
                2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(BASE_FOV / 2)) / aspect),
              ),
            );
        v.camera.updateProjectionMatrix();
      }
      r.render(v.scene, v.camera);
    }
  }
}

function addScaffold(scene: THREE.Scene, index: number): void {
  const grid = new THREE.GridHelper(4, 10, 0x28304a, 0x141a29);
  grid.position.y = -1.75;
  scene.add(grid);

  // Reference cube: data extent for the input view, the tanh activation
  // cube [-1,1]³ for the hidden views.
  const s = index === 0 ? 3.2 : 2.0;
  const cube = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(s, s, s)),
    new THREE.LineBasicMaterial({ color: 0x232b40, transparent: true, opacity: 0.85 }),
  );
  scene.add(cube);

  const axisVerts = new Float32Array([
    -1.4, 0, 0, 1.4, 0, 0,
    0, -1.4, 0, 0, 1.4, 0,
    0, 0, -1.4, 0, 0, 1.4,
  ]);
  const axisGeo = new THREE.BufferGeometry();
  axisGeo.setAttribute('position', new THREE.BufferAttribute(axisVerts, 3));
  const axes = new THREE.LineSegments(
    axisGeo,
    new THREE.LineBasicMaterial({ color: 0x2c3550, transparent: true, opacity: 0.5 }),
  );
  scene.add(axes);
}
