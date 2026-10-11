import { memo, useState } from 'react';
import { Html, RoundedBox } from '@react-three/drei';
import { BUILDINGS, type BuildingDef } from './layout';

export const Buildings = memo(function Buildings({ showLabels }: { showLabels: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <group>
      {BUILDINGS.map((b) => (
        <group
          key={b.id}
          onPointerOver={
            showLabels
              ? (e) => {
                  e.stopPropagation();
                  setHovered(b.id);
                }
              : undefined
          }
          onPointerOut={showLabels ? () => setHovered((h) => (h === b.id ? null : h)) : undefined}
        >
          {b.kind === 'tower' ? <WaterTower b={b} /> : <Block b={b} highlighted={hovered === b.id} />}
          {showLabels && hovered === b.id && (
            <Html position={[b.x, b.h + 4, b.z]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className="whitespace-nowrap rounded-full bg-slate-900/80 px-3 py-1 text-[11px] font-semibold tracking-wide text-white shadow-lg backdrop-blur">
                {b.name}
              </div>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
});

function Block({ b, highlighted }: { b: BuildingDef; highlighted: boolean }) {
  const floors = Math.max(1, Math.round(b.h / 3.6));
  const fh = b.h / floors;
  const isGym = b.id === 'ginasio';
  return (
    <group position={[b.x, 0, b.z]} rotation-y={b.rot ?? 0}>
      <RoundedBox args={[b.w, b.h, b.d]} radius={0.45} smoothness={2} position-y={b.h / 2} castShadow receiveShadow>
        <meshStandardMaterial color={highlighted ? '#ffffff' : '#f4f1ea'} roughness={0.8} />
      </RoundedBox>

      {/* Faixas de janelas por pavimento */}
      {Array.from({ length: floors }, (_, i) => (
        <mesh key={i} position-y={i * fh + fh * 0.56}>
          <boxGeometry args={[b.w + 0.12, fh * (isGym ? 0.22 : 0.36), b.d + 0.12]} />
          <meshStandardMaterial color="#58738a" metalness={0.55} roughness={0.16} envMapIntensity={1.6} />
        </mesh>
      ))}

      {isGym ? (
        // Cobertura em arco
        <group position-y={b.h} rotation-y={Math.PI / 2} scale={[1, 0.32, 1]}>
          <mesh rotation-z={Math.PI / 2} castShadow receiveShadow>
            <cylinderGeometry args={[b.w / 2 + 0.4, b.w / 2 + 0.4, b.d + 0.8, 40, 1, false, 0, Math.PI]} />
            <meshStandardMaterial color={b.accent} roughness={0.55} metalness={0.2} />
          </mesh>
        </group>
      ) : (
        <>
          <mesh position-y={b.h + 0.3} castShadow receiveShadow>
            <boxGeometry args={[b.w + 0.7, 0.6, b.d + 0.7]} />
            <meshStandardMaterial color={b.accent} roughness={0.7} />
          </mesh>
          {b.w > 18 && (
            <>
              <mesh position={[b.w * 0.25, b.h + 1.3, -b.d * 0.15]} castShadow>
                <boxGeometry args={[3, 1.4, 2.4]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.6} />
              </mesh>
              <mesh position={[-b.w * 0.2, b.h + 1.1, b.d * 0.1]} castShadow>
                <boxGeometry args={[2.2, 1, 2.2]} />
                <meshStandardMaterial color="#d6dde6" roughness={0.6} />
              </mesh>
            </>
          )}
        </>
      )}
    </group>
  );
}

function WaterTower({ b }: { b: BuildingDef }) {
  const legH = b.h * 0.62;
  return (
    <group position={[b.x, 0, b.z]}>
      {[
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * 2.2, legH / 2, sz * 2.2]} castShadow>
          <boxGeometry args={[0.5, legH, 0.5]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.6} />
        </mesh>
      ))}
      <mesh position-y={legH + 2.6} castShadow receiveShadow>
        <cylinderGeometry args={[4, 4, 5.2, 32]} />
        <meshStandardMaterial color="#e8eef3" roughness={0.5} metalness={0.2} />
      </mesh>
      <mesh position-y={legH + 5.9} castShadow>
        <coneGeometry args={[4.2, 1.6, 32]} />
        <meshStandardMaterial color={b.accent} roughness={0.5} />
      </mesh>
    </group>
  );
}
