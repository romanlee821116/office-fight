import { useEffect, useMemo, useRef, useState } from 'react';
import { useAnimations, useGLTF } from '@react-three/drei';
import { LoopRepeat, Mesh, type Group, type MeshStandardMaterial } from 'three';
import { PET, getPet, getShopItem } from '@office/shared';
import { toLit } from './Avatar';
import { petUrl } from './Pets';
import { petTintTexture, warmPetTints } from './petTint';

/**
 * 商店試看用的寵物：站在角色旁邊做 idle 動作。
 * 和場上的寵物（Pets.tsx）分開，這裡不需要位置插補、名牌、血條那些東西。
 */
export function PetPreview({ petItemId, tint = '' }: { petItemId: string; tint?: string }) {
  const item = getShopItem(petItemId);
  const def = item?.kind === 'pet' ? getPet(item.asset) : null;
  const model = def?.model ?? '';
  // useGLTF 不能條件呼叫；沒選寵物時整個元件不會被 render
  const { scene, animations } = useGLTF(petUrl(model || 'animal-cat'));
  const group = useRef<Group>(null);

  const instance = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (!(obj instanceof Mesh)) return;
      // 預覽一律 clone 材質：染色時才不會連帶改到場上同種類的寵物
      const own = (mat: Parameters<typeof toLit>[0]) => toLit(mat).clone();
      obj.material = Array.isArray(obj.material) ? obj.material.map(own) : own(obj.material);
    });
    return clone;
  }, [scene]);

  const { actions } = useAnimations(animations, group);
  useEffect(() => {
    const idle = actions['idle'];
    if (idle) idle.reset().setLoop(LoopRepeat, Infinity).play();
  }, [actions]);

  // 預覽的材質是 clone 過的，改貼圖不會影響場上同種類的寵物
  const [, forceRedraw] = useState(0);
  // 先把這隻適用的八個顏色都備好，點色票才會立刻變色而不是等個一拍
  useEffect(() => {
    warmPetTints(() => forceRedraw((n) => n + 1));
  }, []);
  useEffect(() => {
    if (!tint || !def) return;
    const texture = petTintTexture(tint, () => forceRedraw((n) => n + 1));
    if (!texture) return;
    instance.traverse((obj) => {
      if (!(obj instanceof Mesh) || Array.isArray(obj.material)) return;
      (obj.material as MeshStandardMaterial).map = texture;
      (obj.material as MeshStandardMaterial).needsUpdate = true;
    });
  }, [instance, tint, def]);

  if (!model) return null;
  return (
    <group ref={group} position={[0.55, 0, 0.25]} rotation={[0, -0.5, 0]} scale={PET.scale}>
      <primitive object={instance} />
    </group>
  );
}
