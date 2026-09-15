import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';

const POOL = 36;
const LIFE = 0.7;
const SHADES = ['#BFE7FF', '#7FC6F2', '#4BA3DC', '#FFFFFF'];

interface Drop {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  spin: number;
}

const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const scl = new Vector3();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

interface SplashFXProps {
  position?: [number, number, number];
  scale?: number;
  /** 每秒生成粒子數 */
  rate?: number;
}

/** 方塊水花：往上噴再被重力拉回去，配合被按進水裡的掙扎 */
export function SplashFX({ position = [0, 0, 0], scale = 1, rate = 26 }: SplashFXProps) {
  const mesh = useRef<InstancedMesh>(null);
  const drops = useMemo<Drop[]>(
    () => Array.from({ length: POOL }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, spin: 0 })),
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

  useFrame((_state, dt) => {
    const im = mesh.current;
    if (!im) return;
    const step = Math.min(dt, 0.05);

    acc.current += step * rate;
    while (acc.current >= 1) {
      acc.current -= 1;
      const d = drops[cursor.current];
      cursor.current = (cursor.current + 1) % POOL;
      const ang = Math.random() * Math.PI * 2;
      const speed = (0.6 + Math.random() * 0.7) * scale;
      d.x = Math.sin(ang) * 0.2 * scale;
      d.z = Math.cos(ang) * 0.2 * scale;
      d.y = 0;
      d.vx = Math.sin(ang) * speed;
      d.vz = Math.cos(ang) * speed;
      d.vy = (1.6 + Math.random() * 1.2) * scale;
      d.age = 0;
      d.spin = Math.random() * Math.PI * 2;
      d.alive = true;
    }

    for (let i = 0; i < POOL; i++) {
      const d = drops[i];
      if (!d.alive) {
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      d.age += step;
      if (d.age >= LIFE) {
        d.alive = false;
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      d.vy -= 5.5 * step; // 重力
      d.x += d.vx * step;
      d.y += d.vy * step;
      d.z += d.vz * step;
      const size = 0.075 * scale * (0.45 + 0.55 * (1 - d.age / LIFE));
      q.setFromAxisAngle(v.set(0.3, 1, 0.2).normalize(), d.spin + d.age * 6);
      m.compose(v.set(d.x, d.y, d.z), q, scl.set(size, size, size));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <group position={position}>
      <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]}>
          <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
        </boxGeometry>
        <meshBasicMaterial vertexColors />
      </instancedMesh>
    </group>
  );
}
