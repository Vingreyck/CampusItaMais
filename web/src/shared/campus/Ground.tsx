import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAMPUS_BOUNDS, CARS, COURT, PARKING, PLAZA, TREES, WALKWAYS } from './layout';

function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function Ground() {
  const lot = useMemo(() => {
    const w = CAMPUS_BOUNDS.maxX - CAMPUS_BOUNDS.minX + 16;
    const d = CAMPUS_BOUNDS.maxZ - CAMPUS_BOUNDS.minZ + 16;
    return {
      shape: roundedRect(w, d, 18),
      x: (CAMPUS_BOUNDS.maxX + CAMPUS_BOUNDS.minX) / 2,
      z: (CAMPUS_BOUNDS.maxZ + CAMPUS_BOUNDS.minZ) / 2,
    };
  }, []);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={-0.2} receiveShadow>
        <circleGeometry args={[1200, 64]} />
        <meshStandardMaterial color="#c9dab4" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[lot.x, -0.08, lot.z]} receiveShadow>
        <shapeGeometry args={[lot.shape]} />
        <meshStandardMaterial color="#d5e5c1" roughness={1} />
      </mesh>

      {WALKWAYS.map((r, i) => (
        <mesh key={i} position={[r.x, 0.05, r.z]} receiveShadow>
          <boxGeometry args={[r.w, 0.1, r.d]} />
          <meshStandardMaterial color="#efe8dc" roughness={0.95} />
        </mesh>
      ))}

      {/* Praça central */}
      <mesh position={[PLAZA.x, 0.08, PLAZA.z]} receiveShadow>
        <cylinderGeometry args={[PLAZA.r, PLAZA.r, 0.16, 72]} />
        <meshStandardMaterial color="#f4eee4" roughness={0.9} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[PLAZA.x, 0.17, PLAZA.z]}>
        <ringGeometry args={[PLAZA.r - 3.2, PLAZA.r - 2.5, 72]} />
        <meshStandardMaterial color="#dccdb5" roughness={0.9} />
      </mesh>

      {/* Estacionamento */}
      <mesh position={[PARKING.x, 0.04, PARKING.z]} receiveShadow>
        <boxGeometry args={[PARKING.w, 0.08, PARKING.d]} />
        <meshStandardMaterial color="#a9b2ba" roughness={0.95} />
      </mesh>
      {Array.from({ length: 10 }, (_, i) =>
        [-5, 5].map((row) => (
          <mesh key={`${i}${row}`} position={[PARKING.x - PARKING.w / 2 + 1.3 + i * 5.4, 0.09, PARKING.z + row]}>
            <boxGeometry args={[0.18, 0.02, 6]} />
            <meshBasicMaterial color="#f8fafc" />
          </mesh>
        )),
      )}

      {/* Quadra externa */}
      <mesh position={[COURT.x, 0.05, COURT.z]} receiveShadow>
        <boxGeometry args={[COURT.w + 3, 0.1, COURT.d + 3]} />
        <meshStandardMaterial color="#c7775b" roughness={0.9} />
      </mesh>
      <mesh position={[COURT.x, 0.11, COURT.z]} receiveShadow>
        <boxGeometry args={[COURT.w, 0.02, COURT.d]} />
        <meshStandardMaterial color="#3f8f73" roughness={0.85} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[COURT.x, 0.13, COURT.z]}>
        <ringGeometry args={[2.6, 2.85, 48]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[COURT.x, 0.13, COURT.z]}>
        <boxGeometry args={[COURT.w, 0.02, 0.25]} />
        <meshBasicMaterial color="#f8fafc" />
      </mesh>

      <Trees />
      <Cars />
    </group>
  );
}

function Trees() {
  const trunks = useRef<THREE.InstancedMesh>(null);
  const crowns = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    TREES.forEach((t, i) => {
      o.rotation.set(0, 0, 0);
      o.position.set(t.x, 1.3 * t.s, t.z);
      o.scale.set(0.32 * t.s, 2.6 * t.s, 0.32 * t.s);
      o.updateMatrix();
      trunks.current!.setMatrixAt(i, o.matrix);

      o.position.set(t.x, 3.9 * t.s, t.z);
      o.rotation.set(t.r, t.r * 2, 0);
      o.scale.setScalar(2.3 * t.s);
      o.updateMatrix();
      crowns.current!.setMatrixAt(i, o.matrix);
      crowns.current!.setColorAt(i, c.set(t.c));
    });
    trunks.current!.instanceMatrix.needsUpdate = true;
    crowns.current!.instanceMatrix.needsUpdate = true;
    if (crowns.current!.instanceColor) crowns.current!.instanceColor.needsUpdate = true;
  }, []);

  return (
    <>
      <instancedMesh ref={trunks} args={[undefined, undefined, TREES.length]} castShadow>
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial color="#8a6c4f" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, TREES.length]} castShadow receiveShadow>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial flatShading roughness={0.95} />
      </instancedMesh>
    </>
  );
}

function Cars() {
  const bodies = useRef<THREE.InstancedMesh>(null);
  const cabins = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const o = new THREE.Object3D();
    const c = new THREE.Color();
    CARS.forEach((car, i) => {
      o.position.set(car.x, 0.75, car.z);
      o.scale.set(2.1, 1.1, 4.2);
      o.updateMatrix();
      bodies.current!.setMatrixAt(i, o.matrix);
      bodies.current!.setColorAt(i, c.set(car.c));
      o.position.set(car.x, 1.6, car.z + 0.2);
      o.scale.set(1.8, 0.8, 2.2);
      o.updateMatrix();
      cabins.current!.setMatrixAt(i, o.matrix);
    });
    bodies.current!.instanceMatrix.needsUpdate = true;
    cabins.current!.instanceMatrix.needsUpdate = true;
    if (bodies.current!.instanceColor) bodies.current!.instanceColor.needsUpdate = true;
  }, []);

  return (
    <>
      <instancedMesh ref={bodies} args={[undefined, undefined, CARS.length]} castShadow>
        <boxGeometry />
        <meshStandardMaterial roughness={0.4} metalness={0.3} />
      </instancedMesh>
      <instancedMesh ref={cabins} args={[undefined, undefined, CARS.length]}>
        <boxGeometry />
        <meshStandardMaterial color="#334155" roughness={0.2} metalness={0.5} />
      </instancedMesh>
    </>
  );
}
