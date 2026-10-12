import { Suspense, useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls, CameraControlsImpl, Environment, Lightformer } from '@react-three/drei';
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
import * as THREE from 'three';
import { Buildings } from './Buildings';
import { Ground } from './Ground';
import { ControlsContext, Marker, type SceneMarker } from './Marker';

export type { SceneMarker } from './Marker';

/** Converte um ponto da tela (clientX/clientY) em coordenadas do chão do campus. */
export type Projector = (clientX: number, clientY: number) => { x: number; z: number } | null;

export interface CameraFocus {
  x: number;
  z: number;
  key: string;
}

interface CampusSceneProps {
  markers: SceneMarker[];
  selectedId?: string | null;
  /** Para onde a câmera deve voar (null = visão geral). */
  focus?: CameraFocus | null;
  onSelect?: (id: string | null) => void;
  /** Painel administrativo: bolinhas arrastáveis. */
  editable?: boolean;
  onMarkerMove?: (id: string, x: number, z: number) => void;
  projectorRef?: RefObject<Projector | null>;
  /** Chamado quando a cena já consegue converter pontos da tela em pontos do campus. */
  onReady?: () => void;
  view?: 'orbit' | 'top';
  /** Desloca o enquadramento para o lado livre da tela quando há um painel aberto. */
  panelSide?: 'right' | 'bottom' | null;
  autoRotate?: boolean;
  intro?: boolean;
  interactive?: boolean;
  buildingLabels?: boolean;
  effects?: boolean;
  dimOthers?: boolean;
  className?: string;
}

const BOUNDARY = new THREE.Box3(new THREE.Vector3(-150, -1, -130), new THREE.Vector3(150, 40, 150));

export function CampusScene({
  markers,
  selectedId = null,
  focus = null,
  onSelect,
  editable = false,
  onMarkerMove,
  projectorRef,
  onReady,
  view = 'orbit',
  panelSide = null,
  autoRotate = false,
  intro = false,
  interactive = true,
  buildingLabels = true,
  effects = true,
  dimOthers = true,
  className,
}: CampusSceneProps) {
  const controls = useRef<CameraControls>(null);

  return (
    <Canvas
      className={className}
      shadows
      dpr={[1, 2]}
      camera={{ position: [260, 300, 420], fov: FOV, near: 1, far: 3000 }}
      gl={{ antialias: !effects, alpha: true, powerPreference: 'high-performance' }}
      onPointerMissed={() => onSelect?.(null)}
    >
      <ControlsContext.Provider value={controls}>
        <fog attach="fog" args={['#e6edf2', 320, 900]} />
        <hemisphereLight args={['#ffffff', '#b5c7a1', 1.05]} />
        <directionalLight
          castShadow
          position={[90, 150, 70]}
          intensity={2.3}
          color="#fff4e2"
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.05}
        >
          <orthographicCamera attach="shadow-camera" args={[-160, 160, 160, -160, 10, 450]} />
        </directionalLight>
        <Suspense fallback={null}>
          <Environment resolution={256} frames={1} environmentIntensity={0.55}>
            <color attach="background" args={['#dde6ee']} />
            <Lightformer form="rect" intensity={3} position={[0, 40, -80]} scale={[160, 40, 1]} />
            <Lightformer form="rect" intensity={1.5} position={[-90, 25, 40]} rotation-y={Math.PI / 2} scale={[120, 30, 1]} color="#ffe9c7" />
            <Lightformer form="circle" intensity={4} position={[50, 90, 60]} scale={30} />
          </Environment>
        </Suspense>

        <Ground />
        <Buildings showLabels={buildingLabels && interactive} />

        {markers.map((m) => (
          <Marker
            key={m.id}
            m={m}
            selected={m.id === selectedId}
            dimmed={dimOthers && !!selectedId && m.id !== selectedId}
            editable={editable}
            onSelect={onSelect ? (id) => onSelect(id) : undefined}
            onMove={onMarkerMove}
          />
        ))}

        <CameraControls
          ref={controls}
          makeDefault
          enabled={interactive}
          smoothTime={0.75}
          minDistance={18}
          maxDistance={560}
          maxPolarAngle={view === 'top' ? 0.02 : Math.PI * 0.44}
          dollyToCursor
        />
        <CameraRig focus={focus} view={view} panelSide={panelSide} autoRotate={autoRotate} intro={intro} />
        {projectorRef && <ProjectorBridge projectorRef={projectorRef} onReady={onReady} />}

        {effects && (
          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.95} luminanceSmoothing={0.25} radius={0.75} />
            <ToneMapping mode={ToneMappingMode.NEUTRAL} />
            <Vignette offset={0.25} darkness={0.35} />
          </EffectComposer>
        )}
      </ControlsContext.Provider>
    </Canvas>
  );
}

const FOV = 32;
const PANEL_WIDTH = 456; // largura do painel lateral + margem (px)
const SHEET_RATIO = 0.6; // altura ocupada pelo painel inferior no celular

/** Posiciona a câmera em coordenadas esféricas em volta do alvo, pelo caminho angular mais curto. */
function look(c: CameraControls, t: [number, number, number], dist: number, polar: number, azimuth: number, animate: boolean) {
  const s = Math.sin(polar);
  c.setLookAt(
    t[0] + dist * s * Math.sin(azimuth),
    t[1] + dist * Math.cos(polar),
    t[2] + dist * s * Math.cos(azimuth),
    t[0],
    t[1],
    t[2],
    animate,
  );
  c.normalizeRotations();
}

function CameraRig({
  focus,
  view,
  panelSide,
  autoRotate,
  intro,
}: {
  focus: CameraFocus | null;
  view: 'orbit' | 'top';
  panelSide: 'right' | 'bottom' | null;
  autoRotate: boolean;
  intro: boolean;
}) {
  const controls = useThree((s) => s.controls) as CameraControls | null;
  const size = useThree((s) => s.size);
  const mobile = size.width < 768;
  const lastInteraction = useRef(performance.now());
  const introDone = useRef(!intro);

  const goHome = useCallback(
    (c: CameraControls, animate: boolean) => {
      const k = mobile ? 1.55 : 1;
      if (view === 'top') look(c, [0, 0, 11], 300 * k, 0.001, 0, animate);
      // Mantém o ângulo atual de quem está olhando (sem girar o campus de volta).
      else look(c, [0, 0, 10], 265 * k, 0.98, c.azimuthAngle, animate);
      c.setFocalOffset(0, 0, 0, animate);
    },
    [mobile, view],
  );

  useLayoutEffect(() => {
    if (!controls) return;
    controls.setBoundary(BOUNDARY);
    if (!intro) {
      controls.azimuthAngle = 0.55;
      goHome(controls, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  useEffect(() => {
    if (!controls) return;
    if (!introDone.current) {
      introDone.current = true;
      controls.smoothTime = 1.4;
      setTimeout(() => (controls.smoothTime = 0.75), 2500);
    }
    if (focus) {
      const dist = view === 'top' ? (mobile ? 190 : 140) : mobile ? 165 : 118;
      look(controls, [focus.x, 9, focus.z], dist, view === 'top' ? 0.001 : 1.08, controls.azimuthAngle, true);
      // Desloca o enquadramento para a área da tela que o painel não cobre.
      const visH = 2 * dist * Math.tan((FOV * Math.PI) / 360);
      const visW = visH * (size.width / size.height);
      if (panelSide === 'right' && !mobile) controls.setFocalOffset((PANEL_WIDTH / 2 / size.width) * visW, 0, 0, true);
      else if (panelSide) controls.setFocalOffset(0, -(SHEET_RATIO / 2) * visH, 0, true);
      else controls.setFocalOffset(0, 0, 0, true);
    } else {
      goHome(controls, true);
    }
    lastInteraction.current = performance.now();
  }, [controls, focus?.key, focus?.x, focus?.z, panelSide, mobile, view, goHome]); // eslint-disable-line react-hooks/exhaustive-deps

  // Na planta (vista de cima) o botão esquerdo arrasta o mapa; no 3D ele gira.
  useEffect(() => {
    if (!controls) return;
    const A = CameraControlsImpl.ACTION;
    const top = view === 'top';
    controls.mouseButtons.left = top ? A.TRUCK : A.ROTATE;
    controls.mouseButtons.right = top ? A.ROTATE : A.TRUCK;
    controls.touches.one = top ? A.TOUCH_TRUCK : A.TOUCH_ROTATE;
  }, [controls, view]);

  useEffect(() => {
    if (!controls) return;
    const mark = () => (lastInteraction.current = performance.now());
    controls.addEventListener('controlstart', mark);
    controls.addEventListener('control', mark);
    return () => {
      controls.removeEventListener('controlstart', mark);
      controls.removeEventListener('control', mark);
    };
  }, [controls]);

  // Giro lento do campus quando ninguém está interagindo.
  useFrame((_, dt) => {
    if (!controls || !autoRotate || focus) return;
    if (performance.now() - lastInteraction.current > 7000) controls.rotate(dt * 0.03, 0, false);
  });

  return null;
}

function ProjectorBridge({ projectorRef, onReady }: { projectorRef: RefObject<Projector | null>; onReady?: () => void }) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const out = new THREE.Vector3();
    const ndc = new THREE.Vector2();
    (projectorRef as { current: Projector | null }).current = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(plane, out) ? { x: out.x, z: out.z } : null;
    };
    onReady?.();
    return () => {
      (projectorRef as { current: Projector | null }).current = null;
    };
  }, [camera, gl, projectorRef, onReady]);
  return null;
}
