import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  Fog,
  InstancedMesh,
  MeshBasicMaterial,
  Matrix4,
  Quaternion,
  Vector3,
  type AmbientLight,
  type DirectionalLight,
  type HemisphereLight,
  type PointLight,
} from 'three';
import { INDOOR_MAX_X, ROOM_MAX_Z, ROOM_MIN_X, ROOM_MIN_Z } from '@office/shared';
import { useGame } from '../store/useGame';
import { paletteAt } from '../lib/daynight';
import { weatherInfo } from '../lib/weather';

// 測試覆寫：?hour=19.5 強制時刻、?weather=95 強制天氣代碼
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const HOUR_OVERRIDE = params?.has('hour') ? Number(params.get('hour')) : null;
const WEATHER_OVERRIDE = params?.has('weather') ? Number(params.get('weather')) : null;

const OVERCAST_BG = new Color('#9AA6B5');
const FLASH_WHITE = new Color('#FFFFFF');

/** 生效的天氣代碼：測試覆寫最優先；使用者關閉即時天氣時一律視為晴天 */
function effectiveWeatherCode(): number {
  if (WEATHER_OVERRIDE !== null) return WEATHER_OVERRIDE;
  const s = useGame.getState();
  return s.weatherEnabled ? s.weather.code : 0;
}

function localHour(): number {
  const d = new Date();
  return d.getHours() + d.getMinutes() / 60;
}

// ---------- 雨雪粒子 ----------
const POOL = 340;
/** 粒子灑落範圍（以場景為中心，避開室內，落在島外與窗外才看得到雨） */
const AREA = { minX: -30, maxX: 52, minZ: -22, maxZ: 24 };
/** 雨雪只避開室內（辦公室＋健身房）；戶外露台與匹克球場會淋雨 */
const INSIDE = { minX: ROOM_MIN_X - 1, maxX: INDOOR_MAX_X + 1, minZ: ROOM_MIN_Z - 1, maxZ: ROOM_MAX_Z + 1 };
const TOP_Y = 15;

interface Drop {
  x: number;
  y: number;
  z: number;
  speed: number;
  drift: number;
}

const m4 = new Matrix4();
const q4 = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.1);
const v3 = new Vector3();
const s3 = new Vector3();
const HIDDEN = new Matrix4().makeScale(0, 0, 0);

function spawnXZ(drop: Drop): void {
  for (let i = 0; i < 6; i++) {
    const x = AREA.minX + Math.random() * (AREA.maxX - AREA.minX);
    const z = AREA.minZ + Math.random() * (AREA.maxZ - AREA.minZ);
    if (x > INSIDE.minX && x < INSIDE.maxX && z > INSIDE.minZ && z < INSIDE.maxZ) continue; // 不落在室內
    drop.x = x;
    drop.z = z;
    return;
  }
  drop.x = AREA.minX;
  drop.z = AREA.minZ;
}

function Precipitation() {
  const mesh = useRef<InstancedMesh>(null);
  const drops = useMemo<Drop[]>(
    () => Array.from({ length: POOL }, () => ({ x: 0, y: Math.random() * TOP_Y, z: 0, speed: 1, drift: 0 })),
    [],
  );
  const mode = useRef<'rain' | 'snow' | null>(null);

  // instancedMesh 的矩陣預設是單位矩陣：若一開場就是晴天，下方的重灑流程不會執行，
  // 340 個 instance 會疊在原點變成一顆白方塊（剛好落在辦公室地板中央），故掛載時先全部藏起來
  useLayoutEffect(() => {
    const im = mesh.current;
    if (!im) return;
    for (let i = 0; i < POOL; i++) im.setMatrixAt(i, HIDDEN);
    im.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((_state, dt) => {
    const im = mesh.current;
    if (!im) return;
    const info = weatherInfo(effectiveWeatherCode());
    const step = Math.min(dt, 0.05);

    if (info.precip === 'none') {
      if (mode.current !== null) {
        mode.current = null;
        for (let i = 0; i < POOL; i++) im.setMatrixAt(i, HIDDEN);
        im.instanceMatrix.needsUpdate = true;
      }
      return;
    }

    // 切換型態時重灑
    if (mode.current !== info.precip) {
      mode.current = info.precip;
      const snow = info.precip === 'snow';
      const mat = im.material;
      if (mat instanceof MeshBasicMaterial) {
        mat.color.set(snow ? '#FFFFFF' : '#B9CDE8');
        mat.opacity = snow ? 0.95 : 0.65;
      }
      for (const d of drops) {
        spawnXZ(d);
        d.y = Math.random() * TOP_Y;
        d.speed = snow ? 0.9 + Math.random() * 0.8 : 10 + Math.random() * 4;
        d.drift = snow ? (Math.random() - 0.5) * 0.8 : 0.4;
      }
    }

    const snow = info.precip === 'snow';
    const active = Math.floor(POOL * (0.3 + 0.7 * info.intensity));
    for (let i = 0; i < POOL; i++) {
      if (i >= active) {
        im.setMatrixAt(i, HIDDEN);
        continue;
      }
      const d = drops[i];
      d.y -= d.speed * step;
      d.x += d.drift * step;
      if (d.y < 0) {
        spawnXZ(d);
        d.y = TOP_Y * (0.7 + Math.random() * 0.3);
      }
      if (snow) {
        s3.setScalar(0.07);
        v3.set(d.x + Math.sin(d.y * 2) * 0.3, d.y, d.z);
      } else {
        s3.set(0.02, 0.5, 0.02);
        v3.set(d.x, d.y, d.z);
      }
      m4.compose(v3, q4, s3);
      im.setMatrixAt(i, m4);
    }
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, POOL]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#B9CDE8" transparent opacity={0.65} />
    </instancedMesh>
  );
}

/**
 * 日夜與天氣：背景 / 霧 / 三盞燈由本地時間與伺服端天氣驅動，緩慢過渡。
 * 雷雨時偶爾閃電（打亮方向光與天色）。
 */
export function SceneEnvironment() {
  const scene = useThree((s) => s.scene);
  const amb = useRef<AmbientLight>(null);
  const hemi = useRef<HemisphereLight>(null);
  const dir = useRef<DirectionalLight>(null);
  const moon = useRef<PointLight>(null);
  const bg = useMemo(() => new Color('#DFE8F0'), []);
  const cur = useRef({ bg: new Color('#DFE8F0'), dirColor: new Color('#FFFFFF'), dir: 1.6, amb: 0.85, hemi: 0.5, fogNear: 45, fogFar: 90 });
  const flash = useRef(0);
  const nextThunder = useRef(0);

  // 世界往右擴到 x=38（露台），把陰影相機的目標移到世界中心才照得到球場
  useEffect(() => {
    const d = dir.current;
    if (!d) return;
    d.target.position.set(14.5, 0, 0);
    scene.add(d.target);
    return () => {
      scene.remove(d.target);
    };
  }, [scene]);

  useFrame((state, dt) => {
    const info = weatherInfo(effectiveWeatherCode());
    const pal = paletteAt(HOUR_OVERRIDE ?? localHour());

    // 目標值：日夜調色再依陰沉程度往灰色壓
    const targetBg = pal.bg.clone().lerp(OVERCAST_BG, info.overcast * 0.5);
    const targetDir = pal.dir * (1 - 0.55 * info.overcast);
    const targetAmb = pal.amb * (1 - 0.2 * info.overcast);
    const targetFogNear = info.foggy ? 16 : info.precip !== 'none' ? 34 : 45;
    const targetFogFar = info.foggy ? 42 : info.precip !== 'none' ? 72 : 90;

    const c = cur.current;
    const k = 1 - Math.exp(-dt * 1.5);
    c.bg.lerp(targetBg, k);
    c.dirColor.lerp(pal.dirColor, k);
    c.dir += (targetDir - c.dir) * k;
    c.amb += (targetAmb - c.amb) * k;
    c.hemi += (pal.hemi - c.hemi) * k;
    c.fogNear += (targetFogNear - c.fogNear) * k;
    c.fogFar += (targetFogFar - c.fogFar) * k;

    // 雷雨閃電
    if (info.thunder) {
      if (state.clock.elapsedTime > nextThunder.current) {
        flash.current = 1;
        nextThunder.current = state.clock.elapsedTime + 6 + Math.random() * 12;
      }
    }
    flash.current *= Math.exp(-dt * 6);

    bg.copy(c.bg).lerp(FLASH_WHITE, flash.current * 0.55);
    scene.background = bg;
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(bg);
      scene.fog.near = c.fogNear;
      scene.fog.far = c.fogFar;
    }
    if (amb.current) amb.current.intensity = c.amb;
    if (hemi.current) hemi.current.intensity = c.hemi;
    if (dir.current) {
      dir.current.intensity = c.dir + flash.current * 2.5;
      dir.current.color.copy(c.dirColor);
    }
    // 夜間補一盞冷色頂光，避免全暗
    if (moon.current) moon.current.intensity = Math.max(0, 0.9 - c.dir) * 1.2;
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.85} />
      <hemisphereLight ref={hemi} args={['#FFFFFF', '#C9B7A0', 0.5]} />
      <directionalLight
        ref={dir}
        position={[33, 25, 10]}
        intensity={1.6}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
        shadow-normalBias={0.06}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={24}
        shadow-camera-bottom={-24}
        shadow-camera-near={1}
        shadow-camera-far={60}
      />
      <pointLight ref={moon} position={[4, 12, 0]} color="#AFC4E8" intensity={0} distance={45} decay={1.2} />
      <Precipitation />
    </>
  );
}
