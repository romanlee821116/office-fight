# 虛擬辦公室（3D 多人即時連線）

在瀏覽器執行的等角視角 3D 辦公室：選角色進場、WASD 走動、拖曳旋轉視角、頭頂顯示自訂狀態，並與其他在線者即時聊天。純內網執行，不需雲端與帳號。

## 技術堆疊

| 層級 | 選擇 |
| --- | --- |
| 前端 | React 19 + Vite 7 + TypeScript、Three.js + React Three Fiber 9 + drei 10、Zustand 5、Tailwind CSS 4 |
| 伺服端 | Node.js + Colyseus 0.16（@colyseus/core、ws-transport、schema 3）+ Express 5 |
| 共用 | `shared/`：常數、型別、家具配置、碰撞、文字清理（前後端同一份） |

## 目錄

```
office-game/
├ shared/   # @office/shared：常數、型別、avatars/furniture 資料、碰撞與 sanitize 純函式
├ server/   # @office/server：Colyseus OfficeRoom + Express 靜態檔（提供 client/dist）
├ client/   # @office/client：Vite + R3F 前端
│  └ src/
│     ├ app/     # App、OfficePage
│     ├ scene/   # Office、Furniture、Avatar、LocalPlayer、RemotePlayer、CameraRig、NameTag、runtime
│     ├ ui/      # Lobby、ChatPanel、StatusEditor、PlayerList、Hud
│     ├ net/     # Colyseus client 連線與事件橋接
│     └ store/   # Zustand
└ scripts/  # e2e-smoke.mts：雙客戶端連線煙霧測試
```

## 開發

```bash
npm install
npm run dev        # 同時啟動 server (2567) 與 vite (5173)
```

瀏覽 http://localhost:5173 。開兩個分頁即可看到多人同步。加上 `?debug` 可顯示 FPS。

## 內網上線

```bash
npm run build      # 產出 client/dist
npm run start      # 以 production 模式啟動 server，同源提供前端與 WebSocket
```

同事以 `http://<內網IP>:2567` 開啟即可。埠號固定為 2567，可用 `PORT=8080 npm run start` 更改。
若要加進場密碼，啟動時帶 `JOIN_CODE=your-code npm run start`。

```bash
npm run restart    # 停掉占用 2567 的舊伺服器 → 重新打包 → 啟動（改完程式後用這個）
npm run stop       # 只停止伺服器
```

連結預覽：`client/index.html` 含 Open Graph / Twitter Card 標籤，預覽圖為 `client/public/og-image.png`（1200×630），伺服端回傳 index.html 時會把 `og:image` / `og:url` 換成該次請求的絕對網址。注意 Slack、LINE、Teams 等是由其雲端伺服器抓取預覽，內網 IP 不會顯示；搬到公開網址後才會生效。

> 開發模式的 Vite 設為 `strictPort`，5173 被占用時會直接報錯而不是跳到 5174，避免分享出去的網址失效。

### 常駐（pm2）

```bash
npm i -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

### Docker

```bash
docker build -t office-game .
docker run -d --name office-game -p 2567:2567 office-game
```

## 免費雲端部署（Render）

公開網址不受內網網段限制，也自動有 HTTPS（瀏覽器通知才會生效）。Render 免費方案 15 分鐘無人連線會休眠，第一位進入者需等約 30～60 秒喚醒。

**必要準備**：GitHub 帳號、Render 帳號（免費、免信用卡）。

1. 推到 GitHub（專案已含 `render.yaml`）：

```bash
git add -A && git commit -m "chore: initial commit"
gh repo create office-fight --private --source=. --push
```

2. 到 https://dashboard.render.com → New → Blueprint → 選這個 repo，Render 會讀取 `render.yaml` 自動建立服務。
3. 建立時會要求填 `JOIN_CODE`（進場密碼）。**公開網址務必設定**，否則任何拿到連結的人都能進來。
4. 部署完成後得到 `https://office-fight.onrender.com`，分享此網址即可。

**之後改版**：`git push` 後 Render 自動重新部署，不需手動操作。

### 閒置自動離開

免費方案的執行時數有限（每月 750 小時），忘記關的分頁會一直讓伺服器保持喚醒。所以伺服端會主動請閒置的人離開，門檻定義在 `shared/src/constants.ts` 的 `IDLE`：

| 情況 | 門檻 | 說明 |
| --- | --- | --- |
| 分頁切到背景 | 1 小時 | 視為忘記關的分頁 |
| 分頁開著但零操作 | 3 小時 | 例如放在副螢幕，門檻較寬鬆以免打斷「在位」用途 |

離開前 5 分鐘會出現倒數橫幅，任何操作或把分頁切回前景就取消。被移出時使用 consented 關閉碼，前端不會自動重連，會回到大廳並顯示原因。

### 環境變數

| 變數 | 說明 |
| --- | --- |
| `PORT` | 監聽埠，Render 會自動注入；本機預設 2567 |
| `JOIN_CODE` | 進場密碼。有設定時大廳才會出現密碼欄位；留空代表不需密碼 |

### 想要不休眠的免費方案

Oracle Cloud Always Free 的 ARM 主機（東京機房）永久免費且不休眠，適合長期常駐。流程是開一台 VM、裝 Docker、`docker build -t office-game . && docker run -d -p 2567:2567 -e JOIN_CODE=xxx office-game`，前面用 Caddy 反向代理取得 HTTPS。Dockerfile 已附，但未在本機實測（本機 Docker 未啟動）。

## 檢查與測試

```bash
npm run typecheck                 # 三個套件的 tsc
npx tsx scripts/e2e-smoke.mts     # 需先啟動 server；驗證加入/移動/速度驗證/狀態/聊天限流/離開
```

## 操作

- `W/A/S/D` 或方向鍵移動（相對相機方向），`Shift` 加速
- 滑鼠左鍵拖曳旋轉、滾輪縮放（俯角 20°～60°、距離 10～30m）
- `Enter` 開啟聊天、`Esc` 關閉；左下「更改狀態」設定頭頂狀態
- 房間右側 x 12～20 是健身房（玻璃隔間，入口在前側）：跑步機按 `E` 原地跑步、臥推椅按 `E` 臥推、瑜珈墊按 `E` 波比跳，都沿用座位系統（一站一人）；啞鈴架上四個啞鈴可撿起，非格鬥模式按 `空白鍵` 做二頭彎舉，格鬥模式下是傷害 50 的重型近戰武器（不會隨機生成）。器材模型放在 `client/public/models/gym/`
- 走到椅子或沙發 1.4m 內按 `E` 坐下，再按 `E` 或方向鍵起身（起身後站到座位後方）
- `1` / `2` / `3` 或底部按鈕做表情：點頭、搖頭、揮手（坐著時不可用）
- `4`～`7` 跳舞：搖擺、機械、蹲跳、熱舞。舞步為程式生成（`client/src/scene/dances.ts`），以牆上時鐘算節拍，所有人看到的動作一致且會對拍；移動、攻擊、被打或再按一次即停止
- 地上每 20 秒隨機出現一把食物武器（最多 4 把），走近按 `E` 撿起、`Q` 丟下；被擊倒時武器掉在原地。法國麵包、烤雞腿是近戰球棒，漢堡、飲料罐整個丟出去（落地可再撿），蛋糕會噴 6 發奶油
- 左上「格鬥模式」開啟後按 `空白鍵` 攻擊正前方 1.5m 內的玩家；**雙方都開啟**才會命中。血量 200、一拳 25（8 拳倒地）、擊退 1.5m 並短暫僵直，歸零倒地 3 秒後於出生點復活
- 右上在線名單點擊他人可短暫聚焦相機

## 伺服端規則

- 暱稱 2～12 字、狀態 ≤ 30 字、聊天 ≤ 200 字；移除控制字元與 `<>`
- 聊天每人每秒最多 2 則
- 移動以 20Hz 同步；位移超過 `RUN_SPEED × dt × 1.6` 直接拒絕該次更新，並套用共用碰撞（家具、邊界、其他玩家）。玩家為半徑 0.35m 的圓，只推開「移動中的自己」，站著的人不會被擠走；倒地與坐著的人不擋路；出生與復活會找沒人的位置
- 斷線保留 10 秒可重連（前端自動重試 5 次）
- 格鬥由伺服端判定：冷卻 0.6 秒、扇形半角 55°、只命中同樣開啟格鬥模式且未倒地的最近玩家；擊退位置經共用碰撞解算後直接寫入，被打者收到 `hit` 事件才補間位移。倒地者忽略 move / sit / attack，復活由房間計時器觸發並廣播 `respawn`。常數集中在 `shared/src/constants.ts` 的 `FIGHT`
- 武器：定義在 `shared/src/data/weapons.ts`（傷害、距離、擊退、冷卻、彈藥、手持位置）。近戰沿用扇形判定；投擲與射擊在伺服端沿面向方向找走廊內最近目標，於飛行時間到達時才結算並廣播 `hit`，客戶端只播放 `projectile` 的飛行視覺
- 坐下 / 起身由伺服端權威處理：驗證距離與座位是否已被佔用，直接設定座位座標與朝向；坐著時忽略 move。座位表由 `shared/src/data/seats.ts` 從家具推導（椅子 1 席、沙發 2 席）

## 美術資產

家具使用 Kenney Furniture Kit（CC0），GLB 放在 `client/public/models/furniture/`，授權見同目錄 `LICENSE-kenney.txt`。

- Kenney 模型為半比例且原點在角落，`client/src/scene/KitModel.tsx` 載入時會依 bounding box 置中、放大 2 倍並套用陰影與換色
- `client/src/scene/furnitureModels.ts` 定義每種家具由哪些模型組成（配方），可在此調整模型、偏移與顏色
- `shared/src/data/furniture.ts` 的 `w/d` 為碰撞盒，已依模型實際尺寸校正；新增家具時請同步更新
- 模型載入中或沒有對應配方（例如白板）時，回退為 `FurniturePrimitive.tsx` 的程式生成幾何
- 牆面 Hihealth 招牌與標語為 `client/src/scene/WallSign.tsx`，以 drei `Text3D` 搭配 three 內建的 helvetiker 字型（`client/public/fonts/`），不依賴外部 CDN

武器使用 Kenney Food Kit（CC0），GLB 與 `Textures/colormap.png` 放在 `client/public/models/food/`；手持時以 R3F `createPortal` 掛到角色的 `arm-right` 節點，位置與旋轉由 weapons.ts 的 `grip` 控制。

角色使用 Kenney Blocky Characters（CC0），GLB 與貼圖放在 `client/public/models/characters/`（GLB 以相對路徑引用 `Textures/`，兩者需一起搬動）。

- `shared/src/data/avatars.ts` 決定可選角色與對應的 `character-x.glb`；套件共 18 個角色（a～r）全部啟用
- `client/src/scene/Avatar.tsx` 載入 GLB、縮放 0.65（約 1.75m）、把 unlit 材質轉為受光材質，並以 drei `useAnimations` 在 `idle` / `walk` / `sprint` 間 crossfade
- 坐下使用 `sit` clip（播到底後保持姿勢），表情使用 `emote-yes`、`emote-no`、`interact-right`（各播兩輪後自動回 idle）
- 格鬥：攻擊 `attack-melee-right`、被打 `pick-up`（前傾當作僵直）、倒地 `die`（保持最後一幀）；血液為 `client/src/scene/BloodParticles.tsx` 的 InstancedMesh 方塊粒子，沒有螢幕紅暈
