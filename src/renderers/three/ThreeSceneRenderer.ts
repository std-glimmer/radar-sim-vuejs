import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Detection, Mig29RadarMode, RadarControlMode, RadarCursorState, RadarParams, Target } from '../../core/types';

interface ThreeSceneRendererOptions {
  onAddTargetFromGroundPoint?: (x: number, z: number) => void;
  onHoverTarget?: (targetId: string | null) => void;
}

export interface ThreeDisplaySettings {
  showFullRegion: boolean;
  showFullRegionVerticalFaces: boolean;
  showActiveSector: boolean;
  showActiveSectorVerticalFaces: boolean;
  showOrientationGuides: boolean;
}

const FULL_REGION_VERTICAL_DENSITY = 120;

export class ThreeSceneRenderer {
  private readonly scene = new THREE.Scene();
  private readonly targetSphereGeometry = new THREE.SphereGeometry(1500, 12, 8);
  private readonly targetCubeGeometry = new THREE.BoxGeometry(2400, 2400, 2400);
  private readonly targetPyramidGeometry = new THREE.ConeGeometry(1700, 2800, 4);
  private readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly controls: OrbitControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly mouse = new THREE.Vector2();
  private readonly targetMeshes = new Map<string, THREE.Mesh>();
  private readonly targetAltitudeSprites = new Map<string, THREE.Sprite>();
  private readonly detectionPulseUntilMs = new Map<string, number>();
  private showTargetAltitudeLabels = true;
  private hoveredTargetId: string | null = null;
  private inFovTargetIds = new Set<string>();
  private rangeAzimuthOnlyTargetIds = new Set<string>();
  private outOfAzimuthInRangeTargetIds = new Set<string>();
  private outOfRangeTargetIds = new Set<string>();
  private pointerHoverTargetId: string | null = null;
  private radarAltitudeMeters = 0;
  private scanRegionMesh: THREE.Mesh | null = null;
  private fullRegionVerticalSurface: THREE.Mesh | null = null;
  private readonly fullRegionVerticalLines: THREE.Line[] = [];
  private activeScanMesh: THREE.Mesh | null = null;
  private readonly activeBoundaryMeshes: THREE.Mesh[] = [];
  private readonly activeBoundaryLines: THREE.LineSegments[] = [];
  private cursorMesh: THREE.LineLoop | null = null;
  private cursorBoundaryLine: THREE.Line | null = null;
  private cursorBoundaryTopMarker: THREE.Mesh | null = null;
  private cursorBoundaryBottomMarker: THREE.Mesh | null = null;
  private originMesh: THREE.Mesh | null = null;
  private radarAircraftGroup: THREE.Group | null = null;
  private orientationGroup: THREE.Group | null = null;
  private readonly orientationSprites: THREE.Sprite[] = [];
  private displaySettings: ThreeDisplaySettings = {
    showFullRegion: true,
    showFullRegionVerticalFaces: true,
    showActiveSector: true,
    showActiveSectorVerticalFaces: true,
    showOrientationGuides: false,
  };
  private scanRegionParams: {
    maxRangeMeters: number;
    azimuthSpanDeg: number;
    azimuthFovDeg: number;
    beamElevationDeg: number;
    elevationFovDeg: number;
    antennaTiltDeg: number;
    scanCenterAzimuthDeg: number;
  } | null = null;
  private readonly groundPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(400000, 400000),
    new THREE.MeshBasicMaterial({ visible: false }),
  );

  private readonly host: HTMLElement;
  private readonly onAddTargetFromGroundPoint?: (x: number, z: number) => void;
  private readonly onHoverTarget?: (targetId: string | null) => void;
  private readonly defaultCameraPosition = new THREE.Vector3(-108000, 98000, -92000);
  private readonly defaultControlsTarget = new THREE.Vector3(0, 0, 0);

  constructor(host: HTMLElement, options: ThreeSceneRendererOptions = {}) {
    this.host = host;
    this.onAddTargetFromGroundPoint = options.onAddTargetFromGroundPoint;
    this.onHoverTarget = options.onHoverTarget;

    this.scene.background = new THREE.Color('#081018');

    this.camera = new THREE.PerspectiveCamera(60, 1, 10, 1000000);
    this.camera.position.copy(this.defaultCameraPosition);
    this.camera.up.set(0, 1, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.host.appendChild(this.renderer.domElement);
    this.resize();

    this.setupScene();

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.addEventListener('pointerleave', this.handlePointerLeave);
  }

  syncTargets(targets: Target[]): void {
    const nextIds = new Set(targets.map((target) => target.id));

    for (const [id, mesh] of this.targetMeshes.entries()) {
      if (!nextIds.has(id)) {
        this.scene.remove(mesh);
        this.targetMeshes.delete(id);
        this.disposeTargetAltitudeSprite(id);
        this.detectionPulseUntilMs.delete(id);
      }
    }

    for (const target of targets) {
      let mesh = this.targetMeshes.get(target.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.targetSphereGeometry,
          new THREE.MeshStandardMaterial({ color: '#f4d760', emissive: '#332b0a' }),
        );
        mesh.userData.targetId = target.id;
        mesh.userData.shape = 'sphere';
        this.targetMeshes.set(target.id, mesh);
        this.scene.add(mesh);
      }

      mesh.position.set(-target.position.x, target.position.y, target.position.z);
      this.updateTargetAltitudeSprite(target.id, target.position.y, mesh.position);
    }
  }

  render(): void {
    this.applyTargetStyles();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  updateDetectionFlashes(detections: Detection[]): void {
    const pulseEnd = performance.now() + 180;
    for (const detection of detections) {
      this.detectionPulseUntilMs.set(detection.targetId, pulseEnd);
    }
  }

  setTargetHighlights(
    hoveredTargetId: string | null,
    inFovTargetIds: string[],
    rangeAzimuthOnlyTargetIds: string[],
    outOfAzimuthInRangeTargetIds: string[],
    outOfRangeTargetIds: string[],
  ): void {
    this.hoveredTargetId = hoveredTargetId;
    this.inFovTargetIds = new Set(inFovTargetIds);
    this.rangeAzimuthOnlyTargetIds = new Set(rangeAzimuthOnlyTargetIds);
    this.outOfAzimuthInRangeTargetIds = new Set(outOfAzimuthInRangeTargetIds);
    this.outOfRangeTargetIds = new Set(outOfRangeTargetIds);
  }

  setTargetAltitudeLabelsVisible(visible: boolean): void {
    this.showTargetAltitudeLabels = visible;
    for (const sprite of this.targetAltitudeSprites.values()) {
      sprite.visible = visible;
    }
  }

  setDisplaySettings(nextSettings: Partial<ThreeDisplaySettings>): void {
    this.displaySettings = {
      ...this.displaySettings,
      ...nextSettings,
    };

    this.applyDisplaySettings();
  }

  setRadarAircraftVisible(visible: boolean): void {
    if (this.radarAircraftGroup) {
      this.radarAircraftGroup.visible = visible;
    }
  }

  setOriginMarkerVisible(visible: boolean): void {
    if (this.originMesh) {
      this.originMesh.visible = visible;
    }
  }

  resetCameraToDefault(): void {
    this.camera.position.copy(this.defaultCameraPosition);
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(this.defaultControlsTarget);
    this.controls.update();
  }

  centerCameraOnScanZone(params: RadarParams): void {
    const centerAzimuthRad = ((params.radarAzimuthDeg + params.zoneAzimuthOffsetDeg) * Math.PI) / 180;
    const centerElevationRad = (params.antennaTiltDeg * Math.PI) / 180;
    const centerRange = Math.max(1000, params.maxRangeMeters * 0.5);
    const planarRange = Math.cos(centerElevationRad) * centerRange;
    const radarAltitude = params.radarAltitudeMeters;

    const centerPoint = new THREE.Vector3(
      -Math.sin(centerAzimuthRad) * planarRange,
      radarAltitude + Math.sin(centerElevationRad) * centerRange,
      Math.cos(centerAzimuthRad) * planarRange,
    );

    const defaultOffset = new THREE.Vector3().subVectors(this.defaultCameraPosition, this.defaultControlsTarget);
    this.camera.position.copy(centerPoint.clone().add(defaultOffset));
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(centerPoint);
    this.controls.update();
  }

  updateScanCone(sweepAngleRad: number, sweepElevationRad: number, params: RadarParams): void {
    const rangeMeters = Math.max(5000, params.maxRangeMeters);
    const azimuthSpanDeg = Math.max(10, Math.min(360, params.azimuthScanSpanDeg));
    const azimuthFovDeg = Math.max(1, params.fovDeg);
    const effectiveBeamElevationDeg = this.getEffectiveBeamElevationDeg(params);
    const beamElevationDeg = effectiveBeamElevationDeg;
    const elevationFovDeg = Math.max(5, params.elevationFovDeg);
    const antennaTiltDeg = Math.max(-60, Math.min(60, params.antennaTiltDeg));
    const scanCenterAzimuthDeg = params.radarAzimuthDeg + params.zoneAzimuthOffsetDeg;
    this.radarAltitudeMeters = params.radarAltitudeMeters;
    if (this.radarAircraftGroup) {
      this.radarAircraftGroup.position.y = this.radarAltitudeMeters;
    }

    if (
      !this.scanRegionMesh ||
      !this.activeScanMesh ||
      !this.scanRegionParams ||
      this.scanRegionParams.maxRangeMeters !== rangeMeters ||
      this.scanRegionParams.azimuthSpanDeg !== azimuthSpanDeg ||
      this.scanRegionParams.azimuthFovDeg !== azimuthFovDeg ||
      this.scanRegionParams.beamElevationDeg !== beamElevationDeg ||
      this.scanRegionParams.elevationFovDeg !== elevationFovDeg ||
      this.scanRegionParams.antennaTiltDeg !== antennaTiltDeg ||
      this.scanRegionParams.scanCenterAzimuthDeg !== scanCenterAzimuthDeg
    ) {
      this.rebuildScanRegionGeometry(
        rangeMeters,
        azimuthSpanDeg,
        azimuthFovDeg,
        beamElevationDeg,
        elevationFovDeg,
      );
      this.scanRegionParams = {
        maxRangeMeters: rangeMeters,
        azimuthSpanDeg,
        azimuthFovDeg,
        beamElevationDeg,
        elevationFovDeg,
        antennaTiltDeg,
        scanCenterAzimuthDeg,
      };
    }

    if (!this.activeScanMesh) {
      return;
    }

    const antennaTiltRad = (-antennaTiltDeg * Math.PI) / 180;
    const antennaTiltAbsRad = (antennaTiltDeg * Math.PI) / 180;

    this.activeScanMesh.rotation.set(antennaTiltRad, -sweepAngleRad, 0);
    for (const mesh of this.activeBoundaryMeshes) {
      mesh.rotation.set(antennaTiltRad, -sweepAngleRad, 0);
    }
    for (const line of this.activeBoundaryLines) {
      line.rotation.set(antennaTiltRad, -sweepAngleRad, 0);
    }

    const scanCenterAzimuthRad = (scanCenterAzimuthDeg * Math.PI) / 180;
    if (this.scanRegionMesh) {
      this.scanRegionMesh.position.y = this.radarAltitudeMeters;
      this.scanRegionMesh.rotation.set(antennaTiltRad, -scanCenterAzimuthRad, 0);
    }
    if (this.fullRegionVerticalSurface) {
      this.fullRegionVerticalSurface.position.y = this.radarAltitudeMeters;
      this.fullRegionVerticalSurface.rotation.set(antennaTiltRad, -scanCenterAzimuthRad, 0);
    }
    for (const line of this.fullRegionVerticalLines) {
      line.position.y = this.radarAltitudeMeters;
      line.rotation.set(antennaTiltRad, -scanCenterAzimuthRad, 0);
    }

    this.activeScanMesh.position.y = this.radarAltitudeMeters;
    for (const mesh of this.activeBoundaryMeshes) {
      mesh.position.y = this.radarAltitudeMeters;
    }
    for (const line of this.activeBoundaryLines) {
      line.position.y = this.radarAltitudeMeters;
    }

    const tiltRad = -(sweepElevationRad - antennaTiltAbsRad);
    this.activeScanMesh.rotateX(tiltRad);
    for (const mesh of this.activeBoundaryMeshes) {
      mesh.rotateX(tiltRad);
    }
    for (const line of this.activeBoundaryLines) {
      line.rotateX(tiltRad);
    }
  }

  updateCursor(
    cursor: RadarCursorState | null,
    params: RadarParams,
    controlMode?: RadarControlMode,
    mig29RadarMode?: Mig29RadarMode,
  ): void {
    if (!cursor) {
      if (this.cursorMesh) {
        this.cursorMesh.visible = false;
      }
      if (this.cursorBoundaryLine) {
        this.cursorBoundaryLine.visible = false;
      }
      if (this.cursorBoundaryTopMarker) {
        this.cursorBoundaryTopMarker.visible = false;
      }
      if (this.cursorBoundaryBottomMarker) {
        this.cursorBoundaryBottomMarker.visible = false;
      }
      return;
    }

    if (!this.cursorMesh) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(
          [
            -0.5,
            -0.5,
            0,
            0.5,
            -0.5,
            0,
            0.5,
            0.5,
            0,
            -0.5,
            0.5,
            0,
          ],
          3,
        ),
      );
      const material = new THREE.LineBasicMaterial({
        color: '#40ff7a',
      });
      this.cursorMesh = new THREE.LineLoop(geometry, material);
      this.cursorMesh.rotation.x = -Math.PI / 2;
      this.cursorMesh.position.y = 180;
      this.scene.add(this.cursorMesh);
    }

    if (!this.cursorBoundaryLine) {
      const lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
      this.cursorBoundaryLine = new THREE.Line(
        lineGeometry,
        new THREE.LineBasicMaterial({ color: '#9fd9ff', transparent: true, opacity: 0.9 }),
      );
      this.scene.add(this.cursorBoundaryLine);
    }

    if (!this.cursorBoundaryTopMarker) {
      this.cursorBoundaryTopMarker = new THREE.Mesh(
        new THREE.SphereGeometry(320, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#8fd4ff' }),
      );
      this.scene.add(this.cursorBoundaryTopMarker);
    }

    if (!this.cursorBoundaryBottomMarker) {
      this.cursorBoundaryBottomMarker = new THREE.Mesh(
        new THREE.SphereGeometry(320, 10, 8),
        new THREE.MeshBasicMaterial({ color: '#ffd37a' }),
      );
      this.scene.add(this.cursorBoundaryBottomMarker);
    }

    const clampedRange = Math.max(0, Math.min(params.maxRangeMeters, cursor.rangeMeters));
    const centerElevationRad = (params.antennaTiltDeg * Math.PI) / 180;
    const planarRange = Math.cos(centerElevationRad) * clampedRange;
    const x = -Math.sin(cursor.azimuthRad) * planarRange;
    const z = Math.cos(cursor.azimuthRad) * planarRange;
    const y = this.radarAltitudeMeters + Math.sin(centerElevationRad) * clampedRange;

    this.cursorMesh.visible = true;
    this.cursorMesh.position.x = x;
    this.cursorMesh.position.y = y;
    this.cursorMesh.position.z = z;
    this.cursorMesh.rotation.set(-Math.PI / 2, 0, 0);
    const cursorWidthMeters = Math.max(1, params.cursorWidthMeters);
    let cursorLengthMeters = Math.max(1, params.cursorLengthMeters);

    if (controlMode === 'mig29') {
      if (mig29RadarMode === 'v') {
        cursorLengthMeters = Math.max(1, cursorLengthMeters / 0.5);
      } else if (mig29RadarMode === 'd') {
        cursorLengthMeters = Math.max(1, cursorLengthMeters / 1.5);
      }
    }

    this.cursorMesh.scale.set(cursorWidthMeters, cursorLengthMeters, 1);

    const halfElevationSpanRad = (Math.max(5, Math.min(90, params.elevationFovDeg)) * Math.PI) / 360;
    const antennaTiltRad = (Math.max(-60, Math.min(60, params.antennaTiltDeg)) * Math.PI) / 180;
    const upperElevationRad = antennaTiltRad + halfElevationSpanRad;
    const lowerElevationRad = antennaTiltRad - halfElevationSpanRad;

    const topPoint = new THREE.Vector3(
      -Math.sin(cursor.azimuthRad) * Math.cos(upperElevationRad) * clampedRange,
      this.radarAltitudeMeters + Math.sin(upperElevationRad) * clampedRange,
      Math.cos(cursor.azimuthRad) * Math.cos(upperElevationRad) * clampedRange,
    );
    const bottomPoint = new THREE.Vector3(
      -Math.sin(cursor.azimuthRad) * Math.cos(lowerElevationRad) * clampedRange,
      this.radarAltitudeMeters + Math.sin(lowerElevationRad) * clampedRange,
      Math.cos(cursor.azimuthRad) * Math.cos(lowerElevationRad) * clampedRange,
    );

    const rightOffsetDistance = Math.max(2200, params.cursorWidthMeters * 0.6);
    const rightOffset = new THREE.Vector3(
      Math.cos(cursor.azimuthRad) * rightOffsetDistance,
      0,
      Math.sin(cursor.azimuthRad) * rightOffsetDistance,
    );
    topPoint.add(rightOffset);
    bottomPoint.add(rightOffset);

    if (this.cursorBoundaryLine) {
      const attr = this.cursorBoundaryLine.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.setXYZ(0, topPoint.x, topPoint.y, topPoint.z);
      attr.setXYZ(1, bottomPoint.x, bottomPoint.y, bottomPoint.z);
      attr.needsUpdate = true;
      this.cursorBoundaryLine.visible = true;
    }

    if (this.cursorBoundaryTopMarker) {
      this.cursorBoundaryTopMarker.position.copy(topPoint);
      this.cursorBoundaryTopMarker.visible = true;
    }

    if (this.cursorBoundaryBottomMarker) {
      this.cursorBoundaryBottomMarker.position.copy(bottomPoint);
      this.cursorBoundaryBottomMarker.visible = true;
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
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.renderer.domElement.removeEventListener('pointerleave', this.handlePointerLeave);
    this.controls.dispose();

    this.disposeScanMeshes();
    this.disposeCursorMesh();
    this.disposeCursorBoundaryGuides();
    this.disposeAllTargetAltitudeSprites();
    this.disposeRadarAircraftMarker();
    this.disposeOrientationGuides();

    this.targetSphereGeometry.dispose();
    this.targetCubeGeometry.dispose();
    this.targetPyramidGeometry.dispose();

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
    origin.position.y = 0;
    this.originMesh = origin;

    this.groundPlane.rotateX(-Math.PI / 2);

    this.scene.add(ambient);
    this.scene.add(directional);
    this.scene.add(grid);
    this.scene.add(axes);
    this.scene.add(origin);
    this.scene.add(this.groundPlane);
    this.buildRadarAircraftMarker();
    this.buildOrientationGuides();
  }

  private buildRadarAircraftMarker(): void {
    const group = new THREE.Group();

    const silhouettePoints = [
      new THREE.Vector3(0, 0, -2600),
      new THREE.Vector3(500, 0, -1700),
      new THREE.Vector3(2200, 0, -700),
      new THREE.Vector3(1300, 0, -50),
      new THREE.Vector3(800, 0, 1350),
      new THREE.Vector3(350, 0, 2300),
      new THREE.Vector3(0, 0, 2480),
      new THREE.Vector3(-350, 0, 2300),
      new THREE.Vector3(-800, 0, 1350),
      new THREE.Vector3(-1300, 0, -50),
      new THREE.Vector3(-2200, 0, -700),
      new THREE.Vector3(-500, 0, -1700),
    ];

    const silhouetteGeometry = new THREE.BufferGeometry().setFromPoints(silhouettePoints);
    const silhouetteLine = new THREE.LineLoop(
      silhouetteGeometry,
      new THREE.LineBasicMaterial({ color: '#9fb3c5' }),
    );
    group.add(silhouetteLine);

    const finGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 1600),
      new THREE.Vector3(0, 620, 1750),
      new THREE.Vector3(0, 0, 1900),
    ]);
    const finLine = new THREE.Line(
      finGeometry,
      new THREE.LineBasicMaterial({ color: '#9fb3c5' }),
    );
    group.add(finLine);

    group.position.set(0, 0, 0);
    group.visible = false;
    this.radarAircraftGroup = group;
    this.scene.add(group);
  }

  private disposeRadarAircraftMarker(): void {
    if (!this.radarAircraftGroup) {
      return;
    }

    this.scene.remove(this.radarAircraftGroup);
    this.radarAircraftGroup.traverse((object) => {
      const anyObject = object as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      if (anyObject.geometry) {
        anyObject.geometry.dispose();
      }
      if (Array.isArray(anyObject.material)) {
        anyObject.material.forEach((material) => material.dispose());
      } else if (anyObject.material) {
        anyObject.material.dispose();
      }
    });

    this.radarAircraftGroup = null;
  }

  private buildOrientationGuides(): void {
    const guideGroup = new THREE.Group();
    const axisLength = 36000;
    const headLength = 4200;
    const headWidth = 2200;

    const upArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 0),
      axisLength,
      new THREE.Color('#7dff9e'),
      headLength,
      headWidth,
    );
    const downArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 0),
      axisLength,
      new THREE.Color('#ff8e8e'),
      headLength,
      headWidth,
    );
    const northArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, 0),
      axisLength,
      new THREE.Color('#8de3ff'),
      headLength,
      headWidth,
    );

    guideGroup.add(upArrow);
    guideGroup.add(downArrow);
    guideGroup.add(northArrow);

    const upSprite = this.createTextSprite('UP', '#7dff9e');
    upSprite.position.set(0, axisLength + 5000, 0);
    guideGroup.add(upSprite);
    this.orientationSprites.push(upSprite);

    const downSprite = this.createTextSprite('DOWN', '#ff8e8e');
    downSprite.position.set(0, -(axisLength + 5000), 0);
    guideGroup.add(downSprite);
    this.orientationSprites.push(downSprite);

    const northSprite = this.createTextSprite('NORTH', '#8de3ff');
    northSprite.position.set(0, 3500, axisLength + 5000);
    guideGroup.add(northSprite);
    this.orientationSprites.push(northSprite);

    this.orientationGroup = guideGroup;
    this.scene.add(guideGroup);
  }

  private disposeOrientationGuides(): void {
    if (this.orientationGroup) {
      this.scene.remove(this.orientationGroup);
      this.orientationGroup.traverse((object) => {
        const anyObject = object as { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
        if (anyObject.geometry) {
          anyObject.geometry.dispose();
        }
        if (Array.isArray(anyObject.material)) {
          anyObject.material.forEach((material) => material.dispose());
        } else if (anyObject.material) {
          anyObject.material.dispose();
        }
      });
      this.orientationGroup = null;
    }

    for (const sprite of this.orientationSprites) {
      const material = sprite.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
    }
    this.orientationSprites.length = 0;
  }

  private createTextSprite(label: string, color: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D context is not available for orientation label sprite');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '700 42px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(0, 0, 0, 0.35)';
    context.fillRect(8, 8, canvas.width - 16, canvas.height - 16);
    context.fillStyle = color;
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(14000, 5200, 1);
    sprite.renderOrder = 1000;
    return sprite;
  }

  private createTargetAltitudeSprite(label: string): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 224;
    canvas.height = 72;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('2D context is not available for target altitude sprite');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '700 30px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = 'rgba(6, 12, 18, 0.62)';
    context.fillRect(6, 8, canvas.width - 12, canvas.height - 16);
    context.fillStyle = '#d5eeff';
    context.fillText(label, canvas.width / 2, canvas.height / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(9800, 3200, 1);
    sprite.renderOrder = 1001;
    return sprite;
  }

  private formatAltitudeKm(altitudeMeters: number): string {
    return `${(altitudeMeters / 1000).toFixed(1)} km`;
  }

  private updateTargetAltitudeSprite(targetId: string, altitudeMeters: number, position: THREE.Vector3): void {
    const altitudeLabel = this.formatAltitudeKm(altitudeMeters);
    let sprite = this.targetAltitudeSprites.get(targetId);

    if (!sprite || sprite.userData.altitudeLabel !== altitudeLabel) {
      if (sprite) {
        this.disposeSpriteResources(sprite);
        this.scene.remove(sprite);
      }

      sprite = this.createTargetAltitudeSprite(altitudeLabel);
      sprite.userData.altitudeLabel = altitudeLabel;
      sprite.visible = this.showTargetAltitudeLabels;
      this.targetAltitudeSprites.set(targetId, sprite);
      this.scene.add(sprite);
    }

    sprite.position.set(position.x + 3200, position.y + 2400, position.z);
  }

  private disposeSpriteResources(sprite: THREE.Sprite): void {
    const material = sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
  }

  private disposeTargetAltitudeSprite(targetId: string): void {
    const sprite = this.targetAltitudeSprites.get(targetId);
    if (!sprite) {
      return;
    }

    this.scene.remove(sprite);
    this.disposeSpriteResources(sprite);
    this.targetAltitudeSprites.delete(targetId);
  }

  private disposeAllTargetAltitudeSprites(): void {
    for (const [targetId] of this.targetAltitudeSprites) {
      this.disposeTargetAltitudeSprite(targetId);
    }
  }

  private rebuildScanRegionGeometry(
    maxRangeMeters: number,
    azimuthSpanDeg: number,
    azimuthFovDeg: number,
    beamElevationDeg: number,
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
    const halfBeamElevationRad = (beamElevationDeg * Math.PI) / 360;
    const activePhiStart = Math.PI / 2 - halfAzimuthRad;
    const activePhiLength = halfAzimuthRad * 2;
    const activeThetaStart = Math.max(0.001, Math.PI / 2 - halfBeamElevationRad);
    const activeThetaLength = Math.min(Math.PI - 0.002, halfBeamElevationRad * 2);

    const activeGeometry = new THREE.SphereGeometry(
      maxRangeMeters * 1.002,
      48,
      18,
      activePhiStart,
      activePhiLength,
      activeThetaStart,
      activeThetaLength,
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
    this.buildActiveBoundaryFaces(maxRangeMeters, azimuthFovDeg, beamElevationDeg);
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

  private disposeCursorMesh(): void {
    if (!this.cursorMesh) {
      return;
    }

    this.scene.remove(this.cursorMesh);
    this.cursorMesh.geometry.dispose();
    (this.cursorMesh.material as THREE.Material).dispose();
    this.cursorMesh = null;
  }

  private disposeCursorBoundaryGuides(): void {
    if (this.cursorBoundaryLine) {
      this.scene.remove(this.cursorBoundaryLine);
      this.cursorBoundaryLine.geometry.dispose();
      (this.cursorBoundaryLine.material as THREE.Material).dispose();
      this.cursorBoundaryLine = null;
    }

    if (this.cursorBoundaryTopMarker) {
      this.scene.remove(this.cursorBoundaryTopMarker);
      this.cursorBoundaryTopMarker.geometry.dispose();
      (this.cursorBoundaryTopMarker.material as THREE.Material).dispose();
      this.cursorBoundaryTopMarker = null;
    }

    if (this.cursorBoundaryBottomMarker) {
      this.scene.remove(this.cursorBoundaryBottomMarker);
      this.cursorBoundaryBottomMarker.geometry.dispose();
      (this.cursorBoundaryBottomMarker.material as THREE.Material).dispose();
      this.cursorBoundaryBottomMarker = null;
    }
  }

  private buildActiveBoundaryFaces(
    maxRangeMeters: number,
    azimuthFovDeg: number,
    beamElevationDeg: number,
  ): void {
    const halfAzimuthRad = (azimuthFovDeg * Math.PI) / 360;
    const halfElevationRad = (beamElevationDeg * Math.PI) / 360;

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

    if (this.orientationGroup) {
      this.orientationGroup.visible = this.displaySettings.showOrientationGuides;
    }
  }

  private radarToWorld(range: number, azimuthRad: number, elevationRad: number): THREE.Vector3 {
    const cosElevation = Math.cos(elevationRad);
    const x = Math.sin(azimuthRad) * cosElevation * range;
    const y = Math.sin(elevationRad) * range;
    const z = Math.cos(azimuthRad) * cosElevation * range;
    return new THREE.Vector3(x, y, z);
  }

  private getEffectiveBeamElevationDeg(params: RadarParams): number {
    const lines = Math.max(1, Math.round(params.scanLinesCount));
    const zoneElevationDeg = Math.max(5, Math.min(90, params.elevationFovDeg));

    if (lines === 1) {
      return zoneElevationDeg;
    }

    if (params.autoBeamElevationByScanLines) {
      return Math.max(1, Math.min(45, zoneElevationDeg / lines));
    }

    return Math.max(1, Math.min(45, params.beamElevationDeg));
  }

  private applyTargetStyles(): void {
    const now = performance.now();

    for (const [id, mesh] of this.targetMeshes.entries()) {
      const material = mesh.material as THREE.MeshStandardMaterial;
      const isPulse = (this.detectionPulseUntilMs.get(id) ?? 0) > now;
      const isHovered = this.hoveredTargetId === id;
      const isInFov = this.inFovTargetIds.has(id);
      const isRangeAzimuthOnly = this.rangeAzimuthOnlyTargetIds.has(id);
      const isOutAzimuthInRange = this.outOfAzimuthInRangeTargetIds.has(id);
      const isOutOfRange = this.outOfRangeTargetIds.has(id);

      const desiredShape = isInFov ? 'pyramid' : isRangeAzimuthOnly ? 'cube' : 'sphere';
      if (mesh.userData.shape !== desiredShape) {
        if (desiredShape === 'pyramid') {
          mesh.geometry = this.targetPyramidGeometry;
          mesh.rotation.set(0, 0, 0);
        } else if (desiredShape === 'cube') {
          mesh.geometry = this.targetCubeGeometry;
          mesh.rotation.set(0, 0, 0);
        } else {
          mesh.geometry = this.targetSphereGeometry;
          mesh.rotation.set(0, 0, 0);
        }
        mesh.userData.shape = desiredShape;
      }

      if (isInFov || isPulse) {
        material.color.set('#ff6464');
        material.emissive.set('#4d1515');
      } else if (isRangeAzimuthOnly) {
        material.color.set('#f1d061');
        material.emissive.set('#4a3c12');
      } else if (isOutAzimuthInRange) {
        material.color.set('#67d88f');
        material.emissive.set('#123421');
      } else if (isOutOfRange) {
        material.color.set('#aeb7c2');
        material.emissive.set('#323840');
      } else {
        material.color.set('#ff8a8a');
        material.emissive.set('#441010');
      }

      mesh.scale.setScalar(isHovered ? 1.2 : 1);

      const sprite = this.targetAltitudeSprites.get(id);
      if (sprite) {
        sprite.scale.set(isHovered ? 11200 : 9800, isHovered ? 3600 : 3200, 1);
      }
    }
  }

  private emitHoverTarget(nextTargetId: string | null): void {
    if (this.pointerHoverTargetId === nextTargetId) {
      return;
    }

    this.pointerHoverTargetId = nextTargetId;
    this.onHoverTarget?.(nextTargetId);
  }

  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.onHoverTarget) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(Array.from(this.targetMeshes.values()), false);
    if (intersects.length === 0) {
      this.emitHoverTarget(null);
      return;
    }

    const mesh = intersects[0].object as THREE.Mesh;
    const targetId = (mesh.userData.targetId as string | undefined) ?? null;
    this.emitHoverTarget(targetId);
  };

  private handlePointerLeave = (): void => {
    this.emitHoverTarget(null);
  };

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
    this.onAddTargetFromGroundPoint(-point.x, point.z);
  };
}
