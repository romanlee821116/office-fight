import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';

const POOL = 48;
const LIFE = 0.55;
const SHADES = ['#FFD54A', '#FF9E2C', '#F4511E', '#D84315'];

interface Flame {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vy: number;
  age: number;
  spin: number;
}

const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const scl = new Vector3();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

interface FireFXProps {
  /** 火焰底部相對位置 */
  position?: [number, number, number];
  /** 火焰整體大小 */
  scale?: number;
  /** 每秒生成粒子數 */
  rate?: number;
  /** 是否附一盞閃爍的火光 */
  light?: boolean;
}

/** 方塊火焰粒子：持續向上竄、由黃轉紅縮小消失 */
export function FireFX({ position = [0, 0, 0], scale = 1, rate = 34, light = true }: FireFXProps) {
  const mesh = useRef<InstancedMesh>(null);
  const lightRef = useRef<any>(null);
  const flames = useMemo<Flame[]>(
    () => Array.from({ length: POOL }, () => ({ alive: false, x: 0, y: 0, z: 0, vy: 0, age: 0, spin: 0 })),
    [],
  );
  const cursor = useRef(0);
  const acc = useRef(0);

  const colors = useMemo(() => {
    const arr = new Float32Array(POOL * 3);
    const c = new Color();
    for (let i = 0; i < POOL; i++) {
      c.set(SHADES[i % SHADES.length]);
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    return arr;
  }, []);

  useFrame((state, dt) => {
    const im = mesh.current;
    if (!im) return;
    const step = Math.min(dt, 0.05);

    acc.current += step * rate;
    while (acc.current >= 1) {
      acc.current -= 1;
      const f = flames[cursor.current];
      cursor.current = (cursor.current + 1) % POOL;
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.14 * scale;
      f.x = Math.sin(ang) * r;
      f.z = Math.cos(ang) * r;
      f.y = 0;
      f.vy = (0.9 + Math.random() * 0.9) * scale;
      f.age = 0;
      f.spin = Math.random() * Math.PI * 2;
      f.alive = true;
    }

    for (let i = 0; i < POOL; i++) {
      const f = flames[i];
      if (!f.alive) {
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      f.age += step;
      if (f.age >= LIFE) {
        f.alive = false;
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      f.y += f.vy * step;
      f.x += Math.sin(f.age * 20 + f.spin) * 0.08 * step;
      const k = 1 - f.age / LIFE;
      const size = 0.11 * scale * (0.35 + 0.65 * k);
      q.setFromAxisAngle(v.set(0.2, 1, 0.3).normalize(), f.spin + f.age * 8);
      m.compose(v.set(f.x, f.y, f.z), q, scl.set(size, size, size));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;

    if (lightRef.current) {
      lightRef.current.intensity = (1.6 + Math.sin(state.clock.elapsedTime * 17) * 0.5 + Math.sin(state.clock.elapsedTime * 5.3) * 0.3) * scale;
    }
  });

  return (
    <group position={position}>
      <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </boxGeometry>
        <meshBasicMaterial vertexColors />
      </instancedMesh>
      {light && <pointLight ref={lightRef} color="#FF8A3C" distance={4 * scale} decay={2} position={[0, 0.4 * scale, 0]} />}
    </group>
  );
}
