import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { bloodQueue } from './runtime';

const POOL = 320;
const PER_BURST = 22;
const PER_BURST_HEAVY = 40;
const LIFE = 0.7;
const GRAVITY = 12;
const SIZE = 0.07;

interface Particle {
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
const SHADES = ['#B3111B', '#8E0C14', '#D42A33'];

/** 方塊血液粒子：由 bloodQueue 觸發，InstancedMesh 池化更新 */
export function BloodParticles() {
  const mesh = useRef<InstancedMesh>(null);
  const particles = useMemo<Particle[]>(
    () => Array.from({ length: POOL }, () => ({ alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, spin: 0 })),
    [],
  );
  const cursor = useRef(0);

  const spawn = (x: number, z: number, dirX: number, dirZ: number, heavy: boolean) => {
    const count = heavy ? PER_BURST_HEAVY : PER_BURST;
    for (let i = 0; i < count; i++) {
      const p = particles[cursor.current];
      cursor.current = (cursor.current + 1) % POOL;
      const spread = (Math.random() - 0.5) * 1.6;
      const speed = 1.5 + Math.random() * 2.5;
      // 主要沿擊退方向噴出，加上側向與向上的隨機
      p.vx = (dirX + -dirZ * spread) * speed + (Math.random() - 0.5);
      p.vz = (dirZ + dirX * spread) * speed + (Math.random() - 0.5);
      p.vy = 1.5 + Math.random() * 3;
      p.x = x + (Math.random() - 0.5) * 0.2;
      p.y = 0.9 + Math.random() * 0.5;
      p.z = z + (Math.random() - 0.5) * 0.2;
      p.age = 0;
      p.spin = Math.random() * Math.PI * 2;
      p.alive = true;
    }
  };

  useFrame((_state, dt) => {
    const im = mesh.current;
    if (!im) return;

    while (bloodQueue.length) {
      const b = bloodQueue.shift()!;
      spawn(b.x, b.z, b.dirX, b.dirZ, b.heavy);
    }

    const step = Math.min(dt, 0.05);
    for (let i = 0; i < POOL; i++) {
      const p = particles[i];
      if (!p.alive) {
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      p.age += step;
      if (p.age >= LIFE) {
        p.alive = false;
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      p.vy -= GRAVITY * step;
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.z += p.vz * step;
      if (p.y < SIZE / 2) {
        // 落地：貼在地上滑行後消散
        p.y = SIZE / 2;
        p.vy = 0;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
      const k = 1 - p.age / LIFE;
      const size = SIZE * (0.4 + 0.6 * k);
      q.setFromAxisAngle(v.set(0.3, 1, 0.2).normalize(), p.spin + p.age * 6);
      m.compose(v.set(p.x, p.y, p.z), q, scl.set(size, size, size));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  });

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

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]}>
        <instancedBufferAttribute attach="attributes-color" args={[colors, 3]} />
      </boxGeometry>
      <meshStandardMaterial vertexColors roughness={0.6} />
    </instancedMesh>
  );
}
