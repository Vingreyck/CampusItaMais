import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Html, type CameraControls } from '@react-three/drei';
import * as THREE from 'three';
import { clampToCampus } from './layout';

export interface SceneMarker {
  id: string;
  x: number;
  z: number;
  color: string;
  title: string;
  subtitle?: string;
  visible: boolean;
}

export const ControlsContext = createContext<RefObject<CameraControls | null> | null>(null);

const PIN_HEIGHT = 17;
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

type PointerTarget = { setPointerCapture(id: number): void; releasePointerCapture(id: number): void };

interface MarkerProps {
  m: SceneMarker;
  selected: boolean;
  dimmed: boolean;
  editable: boolean;
  onSelect?: (id: string) => void;
  onMove?: (id: string, x: number, z: number) => void;
}

export function Marker({ m, selected, dimmed, editable, onSelect, onMove }: MarkerProps) {
  const group = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const beam = useRef<THREE.MeshBasicMaterial>(null);
  const controls = useContext(ControlsContext);
  const [hovered, setHovered] = useState(false);
  const drag = useRef<{ x: number; z: number; moved: boolean } | null>(null);
  // Posição solta pelo usuário, mantida até os dados (otimistas) chegarem.
  const settled = useRef<{ x: number; z: number } | null>(null);
  const scale = useRef(0);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  useLayoutEffect(() => {
    group.current?.position.set(m.x, 0, m.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    settled.current = null;
  }, [m.x, m.z]);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g || !head.current || !ring.current || !ringMat.current) return;
    const t = state.clock.elapsedTime;
    const target = m.visible ? (selected ? 1.45 : hovered ? 1.2 : 1) : 0;
    scale.current = THREE.MathUtils.damp(scale.current, target, 7, dt);
    g.visible = scale.current > 0.02;
    g.scale.setScalar(Math.max(scale.current, 0.001));

    const pos = drag.current ?? settled.current ?? m;
    const k = drag.current ? 40 : 9;
    g.position.x = THREE.MathUtils.damp(g.position.x, pos.x, k, dt);
    g.position.z = THREE.MathUtils.damp(g.position.z, pos.z, k, dt);

    head.current.position.y = PIN_HEIGHT + Math.sin(t * 1.6 + phase) * 0.45;
    const p = (t * 0.55 + phase / (Math.PI * 2)) % 1;
    ring.current.scale.setScalar(1 + p * 3.2);
    ringMat.current.opacity = (1 - p) * 0.6 * (dimmed ? 0.25 : 1);
    if (beam.current) beam.current.opacity = THREE.MathUtils.damp(beam.current.opacity, selected ? 0.16 : 0, 5, dt);
  });

  const setControls = (enabled: boolean) => {
    if (controls?.current) controls.current.enabled = enabled;
  };

  const handlers = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      document.body.style.cursor = editable ? 'grab' : 'pointer';
      // Desliga a câmera antes do clique para o arraste não girar o campus.
      if (editable) setControls(false);
    },
    onPointerOut: () => {
      setHovered(false);
      if (!drag.current) {
        document.body.style.cursor = '';
        if (editable) setControls(true);
      }
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (!editable) return;
      e.stopPropagation();
      (e.target as unknown as PointerTarget).setPointerCapture(e.pointerId);
      setControls(false);
      drag.current = { x: m.x, z: m.z, moved: false };
      document.body.style.cursor = 'grabbing';
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      if (!drag.current) return;
      if (e.ray.intersectPlane(groundPlane, hit)) {
        const c = clampToCampus(hit.x, hit.z);
        drag.current.moved ||= Math.hypot(c.x - m.x, c.z - m.z) > 0.8;
        drag.current.x = c.x;
        drag.current.z = c.z;
      }
    },
    onPointerUp: (e: ThreeEvent<PointerEvent>) => {
      if (!drag.current) return;
      e.stopPropagation();
      (e.target as unknown as PointerTarget).releasePointerCapture(e.pointerId);
      const d = drag.current;
      drag.current = null;
      setControls(true);
      document.body.style.cursor = hovered ? 'grab' : '';
      if (d.moved) {
        settled.current = { x: d.x, z: d.z };
        onMove?.(m.id, d.x, d.z);
      } else {
        onSelect?.(m.id);
      }
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      if (editable) return;
      e.stopPropagation();
      onSelect?.(m.id);
    },
  };

  const showLabel = (hovered || selected) && m.visible;

  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.3}>
        <circleGeometry args={[1.8, 32]} />
        <meshBasicMaterial color={m.color} transparent opacity={dimmed ? 0.3 : 0.95} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.26}>
        <ringGeometry args={[2, 2.6, 48]} />
        <meshBasicMaterial ref={ringMat} color={m.color} transparent depthWrite={false} />
      </mesh>
      <mesh position-y={PIN_HEIGHT / 2}>
        <cylinderGeometry args={[0.18, 0.18, PIN_HEIGHT, 8]} />
        <meshBasicMaterial color={m.color} transparent opacity={dimmed ? 0.15 : 0.6} />
      </mesh>
      {/* Feixe de luz do projeto selecionado */}
      <mesh position-y={40}>
        <cylinderGeometry args={[2.2, 3.4, 80, 24, 1, true]} />
        <meshBasicMaterial ref={beam} color={m.color} transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
      </mesh>

      <group ref={head} position-y={PIN_HEIGHT}>
        <mesh castShadow>
          <sphereGeometry args={[2.3, 32, 32]} />
          <meshStandardMaterial
            color={m.color}
            emissive={m.color}
            emissiveIntensity={dimmed ? 0.35 : 3.2}
            roughness={0.3}
            toneMapped={false}
            transparent
            opacity={dimmed ? 0.45 : 1}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[3.6, 32, 32]} />
          <meshBasicMaterial color={m.color} transparent opacity={dimmed ? 0.04 : 0.17} depthWrite={false} toneMapped={false} />
        </mesh>
        {showLabel && (
          <Html position={[0, 5.4, 0]} center zIndexRange={[30, 20]} style={{ pointerEvents: 'none' }}>
            <div className="flex max-w-[260px] items-center gap-2 rounded-full bg-white/92 py-1.5 pr-3.5 pl-2 text-xs font-semibold whitespace-nowrap text-slate-800 shadow-[0_8px_30px_-8px_rgba(15,23,42,0.45)] ring-1 ring-black/5 backdrop-blur">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: m.color, boxShadow: `0 0 0 3px ${m.color}33` }} />
              <span className="truncate">{m.title}</span>
            </div>
          </Html>
        )}
      </group>

      {/* Área de clique generosa (invisível) */}
      <mesh position-y={PIN_HEIGHT / 2 + 1.5} {...handlers}>
        <cylinderGeometry args={[4, 4, PIN_HEIGHT + 8, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
