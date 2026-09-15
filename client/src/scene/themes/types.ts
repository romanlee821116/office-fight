import type { PartBuilder } from './parts';

/** 背景物件的一個實例（世界座標；y 省略時落在島外地面 GROUND_Y） */
export interface PropInstance {
  x: number;
  z: number;
  y?: number;
  rotY?: number;
  scale: number;
}

/** 同一個模型（＋同一種換色）的所有實例，合批成一組 InstancedMesh */
export interface PropGroup {
  /** 分組鍵（model＋換色） */
  key: string;
  /** 相對 /models/scenes/ 的路徑，例如 'nyc/city/building-a' */
  model: string;
  /** 整體色調：乘在貼圖上；無貼圖的 nature kit 等同直接換色 */
  tint?: string;
  /** 依材質名稱換色（nature kit 的 leafs / stone / dirt 等） */
  recolor?: Record<string, string>;
  items: PropInstance[];
}

/** 主題配色：島外地面＋室內（辦公室／健身房／露台）的顏色 */
export interface ThemePalette {
  /** 島外地面 */
  ground: string;
  /** 室內地板與格線 */
  floor: string;
  floorGrid: string;
  /** 後牆、左牆、牆腳線 */
  wallBack: string;
  wallSide: string;
  skirting: string;
  /** 浮島地台 */
  base: string;
  /** 露台地面 */
  terrace: string;
}

export interface SceneTheme {
  id: string;
  label: string;
  emoji: string;
  palette: ThemePalette;
  /** 合批的 Kenney 模型；'office' 主題為空 */
  props: PropGroup[];
  /**
   * 自製地標與地面裝飾（primitive，不投影）。回傳收集好零件的 builder，
   * 由 Backdrop 依顏色合批後渲染；第一次用到才建立，之後快取重用。
   */
  landmarks?: () => PartBuilder;
  /** 霧距離倍率：預設辦公室 1；有遠景的主題拉長，否則 40m 外的大樓全被霧吃掉 */
  fogScale?: number;
}
