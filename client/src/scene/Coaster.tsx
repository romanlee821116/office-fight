import { useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Mesh, type Group } from 'three';
import { COASTER, TRACK_PIECES, coasterCarAt, type CoasterPiece } from '@office/shared';
import { kitUrl } from './KitModel';

/**
 * 軌道零件：和 KitModel 不同，這裡**不能**依 bounding box 置中——
 * 零件是靠各自的局部原點首尾相接的，一置中就接不起來了。
 * 擺放點由 shared 的 TRACK_PIECES 算好，這裡照擺即可。
 */
function TrackPiece({ piece }: { piece: CoasterPiece }) {
  const { scene } = useGLTF(kitUrl(`park/coaster/${piece.model}`));
  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      obj.updateMatrix();
      obj.matrixAutoUpdate = false;
      if (obj instanceof Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  return (
    <group position={[piece.x, piece.y, piece.z]} rotation={[0, piece.rotY, 0]}>
      <primitive object={instance} />
    </group>
  );
}

/**
 * 一節車廂。位置每幀由 coasterCarAt 算出來——跟伺服端與其他玩家用的是同一條式子，
 * 所以不需要同步任何車輛狀態，大家看到的車永遠在同一個地方。
 */
function Car({ index }: { index: number }) {
  const group = useRef<Group>(null);
  const body = useRef<Group>(null);
  const model = index === 0 ? 'coaster-train-front' : 'coaster-train';
  const { scene } = useGLTF(kitUrl(`park/coaster/${model}`));
  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (obj instanceof Mesh) obj.castShadow = true;
    });
    return clone;
  }, [scene]);

  useFrame(() => {
    const g = group.current;
    const b = body.current;
    if (!g || !b) return;
    const at = coasterCarAt(index, Date.now());
    g.position.set(at.x, at.y + COASTER.carY, at.z);
    g.rotation.y = at.yaw;
    // 繞 X 轉正值會讓車頭朝下，所以爬升要取負號
    b.rotation.x = -at.pitch;
  });

  return (
    <group ref={group}>
      <group ref={body}>
        <primitive object={instance} />
      </group>
    </group>
  );
}

/** 雲霄飛車：軌道 + 一列三節車廂 */
export function Coaster() {
  return (
    <group>
      {TRACK_PIECES.map((piece, i) => (
        <TrackPiece key={`${piece.model}:${i}`} piece={piece} />
      ))}
      {Array.from({ length: COASTER.carCount }, (_, i) => (
        <Car key={i} index={i} />
      ))}
    </group>
  );
}
