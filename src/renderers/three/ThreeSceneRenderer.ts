import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RadarParams, Target } from '../../core/types';

interface ThreeSceneRendererOptions {
  onAddTargetFromGroundPoint?: (x: number, z: number) => void;
}

export interface ThreeDisplaySettings {
  showFullRegion: boolean;
  showFullRegionVerticalFaces: boolean;
  showActiveSector: boolean;
  showActiveSectorVerticalFaces: boolean;
}

const FULL_REGION_VERTICAL_DENSITY = 120;

export class ThreeSceneRenderer {
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private readonly targetMeshes = new Map<string, THREE.Mesh>();
  private scanRegionMesh: THREE.Mesh | null = null;
  private fullRegionVerticalSurface: THREE.Mesh | null = null;
  private readonly fullRegionVerticalLines: THREE.Line[] = [];
  private activeScanMesh: THREE.Mesh | null = null;
  private readonly activeBoundaryMeshes: THREE.Mesh[] = [];
  private readonly activeBoundaryLines: THREE.LineSegments[] = [];
  private displaySettings: ThreeDisplaySettings = {
    showFullRegion: true,
    showFullRegionVerticalFaces: true,
    showActiveSector: true,
    showActiveSectorVerticalFaces: true,
  };
  private scanRegionParams: {
    maxRangeMeters: number;
    azimuthSpanDeg: number;
    azimuthFovDeg: number;
    elevationFovDeg: number;
  } | null = null;
  private readonly groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(400000, 400000),
    new THREE.MeshBasicMaterial({ visible: false }),
  );

  private readonly host: HTMLElement;
  private readonly onAddTargetFromGroundPoint?: (x: number, z: number) => void;
  private readonly defaultCameraPosition = new THREE.Vector3(130000, 90000, 0);
  private readonly defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  constructor(host: HTMLElement, options: ThreeSceneRendererOptions = {}) {
    this.host = host;
    this.onAddTargetFromGroundPoint = options.onAddTargetFromGroundPoint;

    this.scene.background = new THREE.Color('#081018');

    this.camera = new THREE.PerspectiveCamera(60, 1, 10, 1000000);
    this.camera.position.copy(this.defaultCameraPosition);

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

  setDisplaySettings(nextSettings: Partial<ThreeDisplaySettings>): void {
    this.displaySettings = {
      ...this.displaySettings,
      ...nextSettings,
    };

    this.applyDisplaySettings();
  }

  resetCameraToDefault(): void {
    this.camera.position.copy(this.defaultCameraPosition);
    this.controls.target.copy(this.defaultControlsTarget);
    this.controls.update();
  }

  updateScanCone(sweepAngleRad: number, sweepElevationRad: number, params: RadarParams): void {
    const rangeMeters = Math.max(5000, params.maxRangeMeters);
    const azimuthSpanDeg = Math.max(10, Math.min(360, params.azimuthScanSpanDeg));
    const azimuthFovDeg = Math.max(1, params.fovDeg);
    const elevationFovDeg = Math.max(5, params.elevationFovDeg);

    if (
      !this.scanRegionMesh ||
      !this.activeScanMesh ||
      !this.scanRegionParams ||
      this.scanRegionParams.maxRangeMeters !== rangeMeters ||
      this.scanRegionParams.azimuthSpanDeg !== azimuthSpanDeg ||
      this.scanRegionParams.azimuthFovDeg !== azimuthFovDeg ||
      this.scanRegionParams.elevationFovDeg !== elevationFovDeg
    ) {
      this.rebuildScanRegionGeometry(rangeMeters, azimuthSpanDeg, azimuthFovDeg, elevationFovDeg);
      this.scanRegionParams = {
        maxRangeMeters: rangeMeters,
        azimuthSpanDeg,
        azimuthFovDeg,
        elevationFovDeg,
      };
    }

    if (!this.activeScanMesh) {
      return;
    }

    this.activeScanMesh.rotation.set(0, sweepAngleRad, 0);
    for (const mesh of this.activeBoundaryMeshes) {
      mesh.rotation.set(0, sweepAngleRad, 0);
    }
    for (const line of this.activeBoundaryLines) {
      line.rotation.set(0, sweepAngleRad, 0);
    }

    const tiltRad = -sweepElevationRad;
    this.activeScanMesh.rotateX(tiltRad);
    for (const mesh of this.activeBoundaryMeshes) {
      mesh.rotateX(tiltRad);
    }
    for (const line of this.activeBoundaryLines) {
      line.rotateX(tiltRad);
    }
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
    azimuthSpanDeg: number,
    azimuthFovDeg: number,
    elevationFovDeg: number,
  ): void {
    this.disposeScanMeshes();

    const halfElevationRad = (elevationFovDeg * Math.PI) / 360;
    const spanRad = (Math.max(10, Math.min(360, azimuthSpanDeg)) * Math.PI) / 180;
    const isFullAzimuth = spanRad >= Math.PI * 1.999;
    const fullPhiStart = isFullAzimuth ? 0 : Math.PI / 2 - spanRad * 0.5;
    const fullPhiLength = isFullAzimuth ? Math.PI * 2 : spanRad;
    const thetaStart = Math.max(0.001, Math.PI / 2 - halfElevationRad);
    const thetaLength = Math.min(Math.PI - 0.002, halfElevationRad * 2);

    const fullRegionGeometry = new THREE.SphereGeometry(
      maxRangeMeters,
      64,
      24,
      fullPhiStart,
      fullPhiLength,
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

    this.buildFullRegionVerticalFaces(maxRangeMeters, elevationFovDeg, fullPhiStart, fullPhiLength);
    this.buildActiveBoundaryFaces(maxRangeMeters, azimuthFovDeg, elevationFovDeg);
    this.applyDisplaySettings();
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

    if (this.fullRegionVerticalSurface) {
      this.scene.remove(this.fullRegionVerticalSurface);
      this.fullRegionVerticalSurface.geometry.dispose();
      (this.fullRegionVerticalSurface.material as THREE.Material).dispose();
      this.fullRegionVerticalSurface = null;
    }

    for (const line of this.fullRegionVerticalLines) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.fullRegionVerticalLines.length = 0;

    for (const mesh of this.activeBoundaryMeshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.activeBoundaryMeshes.length = 0;

    for (const line of this.activeBoundaryLines) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.activeBoundaryLines.length = 0;
  }

  private buildActiveBoundaryFaces(
    maxRangeMeters: number,
    azimuthFovDeg: number,
    elevationFovDeg: number,
  ): void {
    const halfAzimuthRad = (azimuthFovDeg * Math.PI) / 360;
    const halfElevationRad = (elevationFovDeg * Math.PI) / 360;

    for (const sign of [-1, 1] as const) {
      const azimuth = sign * halfAzimuthRad;
      const top = this.radarToWorld(maxRangeMeters, azimuth, halfElevationRad);
      const bottom = this.radarToWorld(maxRangeMeters, azimuth, -halfElevationRad);

      const faceGeometry = new THREE.BufferGeometry();
      faceGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            0,
            top.x,
            top.y,
            top.z,
            bottom.x,
            bottom.y,
            bottom.z,
          ],
          3,
        ),
      );
      faceGeometry.setIndex([0, 1, 2]);
      faceGeometry.computeVertexNormals();

      const faceMaterial = new THREE.MeshBasicMaterial({
        color: '#8fffd2',
        transparent: true,
        opacity: 0.16,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial);
      this.activeBoundaryMeshes.push(faceMesh);
      this.scene.add(faceMesh);

      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            0,
            0,
            0,
            top.x,
            top.y,
            top.z,
            0,
            0,
            0,
            bottom.x,
            bottom.y,
            bottom.z,
            top.x,
            top.y,
            top.z,
            bottom.x,
            bottom.y,
            bottom.z,
          ],
          3,
        ),
      );

      const edgeMaterial = new THREE.LineBasicMaterial({
        color: '#c1ffe7',
        transparent: true,
        opacity: 0.75,
      });

      const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      this.activeBoundaryLines.push(edgeLines);
      this.scene.add(edgeLines);
    }
  }

  private buildFullRegionVerticalFaces(
    maxRangeMeters: number,
    elevationFovDeg: number,
    phiStart: number,
    phiLength: number,
  ): void {
    const halfElevationRad = (elevationFovDeg * Math.PI) / 360;
    const segments = FULL_REGION_VERTICAL_DENSITY;

    const surfaceVertices: number[] = [];
    const topLoop: number[] = [];
    const bottomLoop: number[] = [];

    for (let i = 0; i < segments; i += 1) {
      const phi = phiStart + (i / segments) * phiLength;
      const azimuth = Math.PI / 2 - phi;
      const top = this.radarToWorld(maxRangeMeters, azimuth, halfElevationRad);
      const bottom = this.radarToWorld(maxRangeMeters, azimuth, -halfElevationRad);

      topLoop.push(top.x, top.y, top.z);
      bottomLoop.push(bottom.x, bottom.y, bottom.z);

      const nextPhi = phiStart + ((i + 1) / segments) * phiLength;
      const nextAzimuth = Math.PI / 2 - nextPhi;
      const nextTop = this.radarToWorld(maxRangeMeters, nextAzimuth, halfElevationRad);
      const nextBottom = this.radarToWorld(maxRangeMeters, nextAzimuth, -halfElevationRad);

      surfaceVertices.push(
        0,
        0,
        0,
        top.x,
        top.y,
        top.z,
        nextTop.x,
        nextTop.y,
        nextTop.z,
      );

      surfaceVertices.push(
        0,
        0,
        0,
        nextBottom.x,
        nextBottom.y,
        nextBottom.z,
        bottom.x,
        bottom.y,
        bottom.z,
      );
    }

    const surfaceGeometry = new THREE.BufferGeometry();
    surfaceGeometry.setAttribute('position', new THREE.Float32BufferAttribute(surfaceVertices, 3));
    surfaceGeometry.computeVertexNormals();
    const surfaceMaterial = new THREE.MeshBasicMaterial({
      color: '#88deff',
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.fullRegionVerticalSurface = new THREE.Mesh(surfaceGeometry, surfaceMaterial);
    this.scene.add(this.fullRegionVerticalSurface);

    const topLineGeometry = new THREE.BufferGeometry();
    topLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(topLoop, 3));
    const bottomLineGeometry = new THREE.BufferGeometry();
    bottomLineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(bottomLoop, 3));

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: '#b8ebff',
      transparent: true,
      opacity: 0.45,
    });

    const isFullAzimuth = phiLength >= Math.PI * 1.999;
    const topLoopLine = isFullAzimuth
      ? new THREE.LineLoop(topLineGeometry, edgeMaterial)
      : new THREE.Line(topLineGeometry, edgeMaterial);
    const bottomLoopLine = isFullAzimuth
      ? new THREE.LineLoop(bottomLineGeometry, edgeMaterial.clone())
      : new THREE.Line(bottomLineGeometry, edgeMaterial.clone());

    this.fullRegionVerticalLines.push(topLoopLine, bottomLoopLine);
    this.scene.add(topLoopLine, bottomLoopLine);
  }

  private applyDisplaySettings(): void {
    if (this.scanRegionMesh) {
      this.scanRegionMesh.visible = this.displaySettings.showFullRegion;
    }

    const showFullFaces =
      this.displaySettings.showFullRegion && this.displaySettings.showFullRegionVerticalFaces;

    if (this.fullRegionVerticalSurface) {
      this.fullRegionVerticalSurface.visible = showFullFaces;
    }
    for (const line of this.fullRegionVerticalLines) {
      line.visible = showFullFaces;
    }

    if (this.activeScanMesh) {
      this.activeScanMesh.visible = this.displaySettings.showActiveSector;
    }

    const showActiveFaces =
      this.displaySettings.showActiveSector && this.displaySettings.showActiveSectorVerticalFaces;
    for (const mesh of this.activeBoundaryMeshes) {
      mesh.visible = showActiveFaces;
    }
    for (const line of this.activeBoundaryLines) {
      line.visible = showActiveFaces;
    }
  }

  private radarToWorld(range: number, azimuthRad: number, elevationRad: number): THREE.Vector3 {
    const cosElevation = Math.cos(elevationRad);
    const x = Math.sin(azimuthRad) * cosElevation * range;
    const y = Math.sin(elevationRad) * range;
    const z = Math.cos(azimuthRad) * cosElevation * range;
    return new THREE.Vector3(x, y, z);
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
