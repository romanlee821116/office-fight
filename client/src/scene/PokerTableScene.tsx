import { useRef, useState } from 'react';
import { Billboard, Text } from '@react-three/drei';
import { FURNITURE, POKER_SEATS, RANK_LABELS, SUIT_LABELS, getAvatar, isPokerSeat, isRedCard, rankOf, suitOf, type AnimState } from '@office/shared';
import { sendPokerSit } from '../net/client';
import { useGame } from '../store/useGame';
import { Avatar } from './Avatar';

/** 牌桌就是會議室那張長桌 */
const TABLE = FURNITURE.find((f) => f.id === 'meeting-table')!;
/**
 * 綠呢檯面的頂面高度：FurniturePrimitive 的 PokerTable 把檯面中心放在 h + 0.016、
 * 厚度 0.03，所以頂面在 h + 0.031。牌要貼著這個高度平放。
 */
const TABLE_TOP_Y = TABLE.h + 0.031;
/** 一張牌的尺寸，比例取自真實撲克牌（63×88mm） */
const CARD_W = 0.085;
const CARD_H = 0.118;

/**
 * 坐在牌桌上的 NPC。
 *
 * 位置不走網路同步：座位是固定的，前端直接用 POKER_SEATS[index] 擺，
 * 需要同步的只有「這個位子上是誰」，那已經在 state.pokerSeats 裡了。
 */
function PokerNpc({ index, name, avatarId, folded }: { index: number; name: string; avatarId: string; folded: boolean }) {
  const seat = POKER_SEATS[index];
  const anim = useRef<AnimState>('sit');
  return (
    <group position={[seat.x, 0, seat.z]} rotation={[0, seat.rotY, 0]}>
      <Avatar avatar={getAvatar(avatarId)} animRef={anim} weaponId="" carrying={false} crowned={false} hatId="" outfitId="" faceUrl="" />
      <Billboard position={[0, 1.95, 0]}>
        <Text fontSize={0.16} color={folded ? '#9aa5b1' : '#2b2b2b'} outlineWidth={0.012} outlineColor="#ffffff" anchorX="center">
          {name}
        </Text>
      </Billboard>
    </group>
  );
}

/** 平放在桌面上的一張牌，牌面朝上 */
function BoardCard({ card, x }: { card: number; x: number }) {
  return (
    <group position={[x, TABLE_TOP_Y + 0.01, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
      <Text
        position={[0, 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.05}
        color={isRedCard(card) ? '#cc2222' : '#222222'}
        anchorX="center"
        anchorY="middle"
      >
        {`${RANK_LABELS[rankOf(card)]}${SUIT_LABELS[suitOf(card)]}`}
      </Text>
    </group>
  );
}

/** 桌面中央的公共牌與底池 */
function Board() {
  const board = useGame((s) => s.poker.board);
  const pot = useGame((s) => s.poker.pot);
  if (board.length === 0 && pot === 0) return null;
  const startX = TABLE.x - ((board.length - 1) * (CARD_W + 0.015)) / 2;
  return (
    <group position={[0, 0, TABLE.z]}>
      {board.map((card, i) => (
        <BoardCard key={card} card={card} x={startX + i * (CARD_W + 0.015)} />
      ))}
      {pot > 0 && (
        <Billboard position={[TABLE.x, TABLE_TOP_Y + 0.33, 0]}>
          <Text fontSize={0.13} color="#f5f0e6" outlineWidth={0.012} outlineColor="#1f3a2e" anchorX="center">
            {`底池 ${pot}`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

/**
 * 空位上的可點擊區域。
 *
 * 椅子本身是家具（合批或 primitive 畫的），不好個別掛事件，所以在座位上疊一塊
 * 看不見的方塊接點擊。只有走到入座距離內才會出現——伺服端一樣會驗距離，
 * 這裡擋在前面是為了不讓人從房間另一頭點一下就瞬移到椅子上。
 */
function SeatHotspot({ index }: { index: number }) {
  const seat = POKER_SEATS[index];
  const [hover, setHover] = useState(false);
  return (
    <group position={[seat.x, 0, seat.z]}>
      <mesh
        position={[0, 0.9, 0]}
        onClick={(e) => {
          e.stopPropagation();
          sendPokerSit(index);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <boxGeometry args={[0.7, 1.8, 0.7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {/* 腳邊的提示圈，滑鼠移上去會亮一點 */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.33, 0.42, 24]} />
        <meshBasicMaterial color={hover ? '#FFD23D' : '#6FCF97'} transparent opacity={hover ? 0.95 : 0.5} depthWrite={false} />
      </mesh>
      {hover && (
        <Billboard position={[0, 1.5, 0]}>
          <Text fontSize={0.16} color="#2b2b2b" outlineWidth={0.014} outlineColor="#ffffff" anchorX="center">
            入座牌桌
          </Text>
        </Billboard>
      )}
    </group>
  );
}

/** 走到入座距離內時，空位上會出現可以點的提示圈 */
function SeatHotspots() {
  const seats = useGame((s) => s.poker.seats);
  const nearSeat = useGame((s) => s.nearPokerSeat);
  const meId = useGame((s) => s.me?.sessionId);
  const players = useGame((s) => s.players);
  const seated = meId ? isPokerSeat(players[meId]?.seatId ?? '') : false;
  // 已經坐著、或根本不在牌桌邊就不顯示
  if (seated || nearSeat < 0) return null;
  return (
    <>
      {POKER_SEATS.map((_, index) => (seats[index]?.id ? null : <SeatHotspot key={index} index={index} />))}
    </>
  );
}

/** 牌室裡會動的東西：坐著的 NPC、桌面上的公共牌與底池 */
export function PokerTableScene() {
  const seats = useGame((s) => s.poker.seats);
  return (
    <>
      {seats.map((seat, index) =>
        seat.id && seat.isNpc ? (
          <PokerNpc key={seat.id} index={index} name={seat.name} avatarId={seat.avatarId} folded={seat.folded} />
        ) : null,
      )}
      <Board />
      <SeatHotspots />
    </>
  );
}
