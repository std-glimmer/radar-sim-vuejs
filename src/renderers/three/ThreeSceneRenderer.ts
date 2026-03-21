import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RadarParams, Target } from '../../core/types';

interface ThreeSceneRendererOptions {
  onAddTargetFromGroundPoint?: (x: number, z: number) => void;
}

export class ThreeSceneRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private readonly targetMeshes = new Map<string, THREE.Mesh>();
  private scanRegionMesh: THREE.Mesh | null = null;
  private activeScanMesh: THREE.Mesh | null = null;
  private scanRegionParams: {
    maxRangeMeters: number;
    azimuthFovDeg: number;
    elevationFovDeg: number;
  } | null = null;
  private readonly groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(400000, 400000),
    new THREE.MeshBasicMaterial({ visible: false }),
  );

  private readonly host: HTMLElement;
  private readonly onAddTargetFromGroundPoint?: (x: number, z: number) => void;

  constructor(host: HTMLElement, options: ThreeSceneRendererOptions = {}) {
    this.host = host;
    this.onAddTargetFromGroundPoint = options.onAddTargetFromGroundPoint;

    this.scene.background = new THREE.Color('#081018');

    this.camera = new THREE.PerspectiveCamera(60, 1, 10, 1000000);
    this.camera.position.set(85000, 65000, 85000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.host.appendChild(this.renderer.domElement);
    this.resize();

    this.setupScene();

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
  }

  syncTargets(targets: Target[]): void {
    const nextIds = new Set(targets.map((target) => target.id));

    for (const [id, mesh] of this.targetMeshes.entries()) {
      if (!nextIds.has(id)) {
        this.scene.remove(mesh);
        this.targetMeshes.delete(id);
      }
    }

    for (const target of targets) {
      let mesh = this.targetMeshes.get(target.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(1500, 12, 8),
          new THREE.MeshStandardMaterial({ color: '#5be7a9', emissive: '#0d2d23' }),
        );
        this.targetMeshes.set(target.id, mesh);
        this.scene.add(mesh);
      }

      mesh.position.set(target.position.x, target.position.y, target.position.z);
    }
  }

  render(): void {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateScanCone(sweepAngleRad: number, params: RadarParams): void {
    const rangeMeters = Math.max(5000, params.maxRangeMeters);
    const azimuthFovDeg = Math.max(1, params.fovDeg);
    const elevationFovDeg = Math.max(5, params.elevationFovDeg);

    if (
      !this.scanRegionMesh ||
      !this.activeScanMesh ||
      !this.scanRegionParams ||
      this.scanRegionParams.maxRangeMeters !== rangeMeters ||
      this.scanRegionParams.azimuthFovDeg !== azimuthFovDeg ||
      this.scanRegionParams.elevationFovDeg !== elevationFovDeg
    ) {
      this.rebuildScanRegionGeometry(rangeMeters, azimuthFovDeg, elevationFovDeg);
      this.scanRegionParams = {
        maxRangeMeters: rangeMeters,
        azimuthFovDeg,
        elevationFovDeg,
      };
    }

    if (!this.activeScanMesh) {
      return;
    }

    this.activeScanMesh.rotation.set(0, sweepAngleRad, 0);
  }

  resize(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  dispose(): void {
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.controls.dispose();

    this.disposeScanMeshes();

    this.renderer.dispose();
    this.host.removeChild(this.renderer.domElement);
  }

  private setupScene(): void {
    const ambient = new THREE.AmbientLight('#87a0b8', 0.55);
    const directional = new THREE.DirectionalLight('#d6ebff', 0.75);
    directional.position.set(100000, 140000, 30000);

    const grid = new THREE.GridHelper(240000, 24, '#40688e', '#1d3142');
    const axes = new THREE.AxesHelper(25000);

    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 16, 12),
      new THREE.MeshBasicMaterial({ color: '#ffcb6b' }),
    );

    this.groundPlane.rotateX(-Math.PI / 2);

    this.scene.add(ambient);
    this.scene.add(directional);
    this.scene.add(grid);
    this.scene.add(axes);
    this.scene.add(origin);
    this.scene.add(this.groundPlane);
  }

  private rebuildScanRegionGeometry(
    maxRangeMeters: number,
    azimuthFovDeg: number,
    elevationFovDeg: number,
  ): void {
    this.disposeScanMeshes();

    const halfElevationRad = (elevationFovDeg * Math.PI) / 360;
    const thetaStart = Math.max(0.001, Math.PI / 2 - halfElevationRad);
    const thetaLength = Math.min(Math.PI - 0.002, halfElevationRad * 2);

    const fullRegionGeometry = new THREE.SphereGeometry(
      maxRangeMeters,
      64,
      24,
      0,
      Math.PI * 2,
      thetaStart,
      thetaLength,
    );

    const fullRegionMaterial = new THREE.MeshBasicMaterial({
      color: '#54d8ff',
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.scanRegionMesh = new THREE.Mesh(fullRegionGeometry, fullRegionMaterial);
    this.scene.add(this.scanRegionMesh);

    const halfAzimuthRad = (azimuthFovDeg * Math.PI) / 360;
    const activePhiStart = Math.PI / 2 - halfAzimuthRad;
    const activePhiLength = halfAzimuthRad * 2;

    const activeGeometry = new THREE.SphereGeometry(
      maxRangeMeters * 1.002,
      48,
      18,
      activePhiStart,
      activePhiLength,
      thetaStart,
      thetaLength,
    );

    const activeMaterial = new THREE.MeshBasicMaterial({
      color: '#5bffb3',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.activeScanMesh = new THREE.Mesh(activeGeometry, activeMaterial);
    this.scene.add(this.activeScanMesh);
  }

  private disposeScanMeshes(): void {
    if (this.scanRegionMesh) {
      this.scene.remove(this.scanRegionMesh);
      this.scanRegionMesh.geometry.dispose();
      (this.scanRegionMesh.material as THREE.Material).dispose();
      this.scanRegionMesh = null;
    }

    if (this.activeScanMesh) {
      this.scene.remove(this.activeScanMesh);
      this.activeScanMesh.geometry.dispose();
      (this.activeScanMesh.material as THREE.Material).dispose();
      this.activeScanMesh = null;
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.onAddTargetFromGroundPoint) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundPlane, false);

    if (intersects.length === 0) {
      return;
    }

    const point = intersects[0].point;
    this.onAddTargetFromGroundPoint(point.x, point.z);
  };
}
