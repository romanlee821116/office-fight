import { useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import { CAMERA } from '@office/shared';
import { local, remoteTargets, rig } from './runtime';

const ROTATE_SPEED = 0.005;
const ZOOM_SPEED = 0.01;
const desired = new Vector3();

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * 等角風格跟隨相機：左鍵拖曳旋轉、滾輪縮放、平滑跟隨玩家。
 */
export function CameraRig() {
  const { camera, gl } = useThree();

  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinchDist = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      rig.tour = null;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      rig.yaw -= dx * ROTATE_SPEED;
      rig.pitch = clamp(rig.pitch + dy * ROTATE_SPEED, CAMERA.pitchMin, CAMERA.pitchMax);
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      rig.tour = null;
      rig.distance = clamp(rig.distance + e.deltaY * ZOOM_SPEED, CAMERA.distanceMin, CAMERA.distanceMax);
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        rig.tour = null;
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist) {
          rig.distance = clamp(rig.distance - (d - pinchDist) * 0.03, CAMERA.distanceMin, CAMERA.distanceMax);
        }
        pinchDist = d;
      }
    };
    const onTouchEnd = () => {
      pinchDist = 0;
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointercancel', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointercancel', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, [gl]);

  useFrame((_state, dt) => {
    // 切換場景後的觀景運鏡：平滑靠近目標角度，夠近就結束
    const tour = rig.tour;
    if (tour) {
      const k = 1 - Math.exp(-Math.min(dt, 0.05) * 4);
      rig.pitch += (tour.pitch - rig.pitch) * k;
      rig.distance += (tour.distance - rig.distance) * k;
      if (Math.abs(rig.pitch - tour.pitch) < 0.004 && Math.abs(rig.distance - tour.distance) < 0.06) rig.tour = null;
    }

    // 決定跟隨目標：聚焦中的玩家或本地玩家
    let tx = local.x;
    let tz = local.z;
    if (rig.focusSessionId && performance.now() < rig.focusUntil) {
      const t = remoteTargets.get(rig.focusSessionId);
      if (t) {
        tx = t.x;
        tz = t.z;
      }
    } else {
      rig.focusSessionId = null;
    }

    desired.set(tx, 1, tz);
    rig.target.lerp(desired, CAMERA.followLerp);

    const cp = Math.cos(rig.pitch);
    camera.position.set(
      rig.target.x + rig.distance * cp * Math.sin(rig.yaw),
      rig.target.y + rig.distance * Math.sin(rig.pitch),
      rig.target.z + rig.distance * cp * Math.cos(rig.yaw),
    );
    camera.lookAt(rig.target);
  });

  return null;
}
