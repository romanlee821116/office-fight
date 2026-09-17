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
- 房間右側 x 12～23 是健身房（11m 寬）（玻璃隔間，入口在前側）：跑步機按 `E` 原地跑步、臥推椅按 `E` 臥推、瑜珈墊按 `E` 波比跳，、Smith 綜合架按 `E` 做斜板臥推、深蹲架按 `E` 做槓鈴深蹲，都沿用座位系統（一站一人）；啞鈴架上四個啞鈴可撿起，非格鬥模式按 `空白鍵` 做二頭彎舉，格鬥模式下是傷害 50 的重型近戰武器（不會隨機生成）。器材模型放在 `client/public/models/gym/`
- 辦公室有一隻寵物（Kenney Cube Pets，CC0，模型在 `client/public/models/pets/`）：伺服端 AI 讓牠隨機走動、停頓、跳舞。開格鬥模式可以打牠（決鬥中不行），被打倒會翻倒消失，幾秒後重生一隻新的隨機寵物。走近按 `E` 可以把牠抱起來頂在頭上帶著走，再按 `E` 輕輕放下，按 `空白鍵` 往前丟出去（拋物線，不造成傷害，落地後牠會生氣地抖一下）。被抱著或飛行中的寵物打不到；坐下、開始決鬥、被擊倒或離線都會自動放下。參數在 `shared/src/constants.ts` 的 `PET`
- 拿著食物按 `F`：附近有寵物就餵牠（食物消耗、寵物回滿血並播進食動畫，頭上飄愛心；每餵一次長大 20%，餵滿 5 次為兩倍大，越胖被打飛得越近）；否則在瓦斯爐旁就放上去煎。煎 20 秒內可空手按 `E` 拿回；放太久會燒起來（火焰粒子＋火光），再 12 秒化成灰。**著火時靠近爐子 1.4m 會被延燒**：每 0.5 秒扣 6 血、頭上冒火，離開 2 秒後熄滅；被燒到血量歸零一樣倒地重生。參數在 `shared/src/constants.ts` 的 `STOVE`
- 日夜與即時天氣：伺服端每 30 分鐘向 Open-Meteo（免金鑰）抓一次台北天氣（`WEATHER_LAT` / `WEATHER_LON` 可改地點），天色與燈光依本地時間平滑過渡（清晨/白天/黃昏/夜晚），陰天調暗、起霧收近霧距、下雨下雪有粒子（只落在室外）、雷雨偶爾閃電。左上面板顯示溫度與天氣，旁邊有「即時天氣」開關（預設開，關閉後自己的畫面固定為晴天、日夜照常，偏好存 localStorage）。測試可用網址參數 `?hour=19.5` 強制時刻、`?weather=95` 強制天氣代碼
- 場景主題：左上面板「場景」列可切換 辦公室／紐約／台灣／日本／海島／埃及，只換島外景色與室內配色（地板、牆、地台、露台），格局、碰撞與玩法不變，天空仍照日夜天氣走（主題只把霧距拉遠）。純本機視覺效果，別人看不到你選了什麼，選擇存 localStorage。切換時鏡頭會自動抬到觀景角度（俯角 10°、距離 22），一拖曳或縮放就交還控制權；為此相機最低俯角從 20° 放寬到 8°。主題資料在 `client/src/scene/themes/`，每個主題一個檔（配色、合批模型清單、primitive 地標）。台灣有完整街廓：紅磚人行道＋柏油雙黃線＋斑馬線、整排機車與機車格、騎樓透天（招牌、鐵窗、冷氣、頂樓鐵皮加蓋與水塔）、小吃攤與紅色塑膠椅、夜市棚與燈串、電線桿；地標有台北 101、自由女神、鳥居＋五重塔＋日式庭園參道、火山島、金字塔＋人面獅身（後兩者為外部下載模型）
- 匹克球（健身房右側戶外露台，會淋雨）：兩側報名點站上去按 `E` 加入，雙方到齊倒數發球。球以拋物線事件同步（伺服端算落點與時間、各端播同一條曲線），飛行中地面有白色虛線圈標示落點，球第一次落地會往前彈一小段、**第二次觸地才算失分**（可在落地前截擊，也可等彈起再打），只要球在身邊 1.7m 內按 `空白鍵` 就回擊，壓角由揮拍瞬間的面向決定；沒接到就對方得分，每球得分制先到 7 分獲勝，得分者發下一球。比賽中雙方不參與格鬥、不能坐下/決鬥/抱寵物，退出或倒地視為棄權。參數在 `shared/src/constants.ts` 的 `COURT`
- 聖誕小鎮（辦公室／健身房正前方，z 8～20）：走出大門就是雪地小鎮。三棟原木屋（兩格寬的模組化拼裝，山牆、45° 雪頂、屋角原木柱、煙囪、花圈）、掛著燈串的一整排路燈、大聖誕樹與繞著它跑的玩具小火車，還有雪人、馴鹿、雪橇、禮物與積雪岩塊。廣場兩側與屋子門口共四張長椅走近按 `E` 就能坐下（一張一人）。木屋、樹、岩石、長椅都有碰撞；從 cabin-a 與 cabin-b 之間的巷子往南穿過圍籬缺口，就進到打雪仗場地
- 浮島地台（那圈灰色裙邊）是整個世界共用的一塊 `WorldBase`，不是每塊場地各畫一塊——各畫各的話相鄰兩塊會疊出 1.2m 寬的重疊帶，上下面完全共面，交界處就會整條 z-fighting
- 打雪仗（小鎮再往南，x -12～12、z 20～40，24 x 20m）：雪地球場，中線把場地分成兩半，兩邊各有三座雪堡掩體（以中線鏡射對稱，位置一模一樣）、四堆備料用的雪、雪人靶子與雪橇。兩個出入口：北側從小鎮進來（`SNOW_GATE_X`），東側圍籬在 `SNOW_PARK_GATE_Z` 開了一個 4.5m 缺口直通遊樂園（避開旋轉木馬碰撞盒與場地東南角的雪松）。
  - **自由模式**：走進場地就自動進入雪仗模式——手上的東西（食物、寵物、路人）會自動放下、格鬥模式關閉、改拿雪球。**想走隨時可以走**，從北側缺口離開場地就自動退出（也可以用面板的按鈕原地退出）
  - **分隊模式**：場地兩端各有一支隊旗（北側紅隊 `(3, 21.5)`、南側藍隊 `(-3, 38.5)`），站上去按 `E` 報名。兩隊都有人時倒數 5 秒開打，比賽中也可以中途加入。分隊的人腳下會有一圈隊伍顏色（紅／藍），是分隊模式唯一的敵我辨識
  - **雪球**：一次最多帶五顆（`SNOWFIGHT.maxBalls`，剛好是打倒一個人的量），按 `空白鍵` 丟出。走直線（不是漢堡那種拋物線），速度是漢堡的兩倍（18 m/s）、射程 14m，瞄哪裡打哪裡；伺服端的命中判定本來就是沿面向方向的直線走廊，這樣視覺與判定完全一致。丟完走到四個雪堆的凹槽旁按 `E` 補滿。雪仗模式下**只能丟雪球**，不能徒手、不能撿別的武器、不能坐下、不能決鬥
  - **命中規則**：雪球只打得到同樣在雪仗模式的人，而且要「兩邊都沒分隊」或「分屬不同隊」——所以打不到隊友，自由模式的人也攪不了比賽的局
  - **出局**：血量沿用 200，一顆雪球 40 傷害，**中五顆出局**。出局不是倒地，角色不會死，只是原地退出雪仗模式（血量補滿、雪球收走），自己走出場地即可；自由模式出局後要先走出場地才會重新進場。分隊時最後一個人出局該隊就輸，勝負公告 8 秒後清場
  - **走不出場地的只有分隊比賽的人**（`snowConfined()`）：比賽中不能躲到場外賴皮，被雪球打退也不會被推出界；自由模式完全不受限制
  - 參數在 `shared/src/constants.ts` 的 `SNOWFIGHT`，補彈點在 `shared/src/data/xmas.ts` 的 `SNOW_PILES`
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
- 模型與字型檔名不帶 hash，URL 會附上建置時產生的 `__ASSET_VERSION__` 版本號，改版後瀏覽器才不會沿用舊檔
- 牆面 Hihealth 招牌與標語為 `client/src/scene/WallSign.tsx`，以 drei `Text3D` 搭配 three 內建的 helvetiker 字型（`client/public/fonts/`），不依賴外部 CDN

武器使用 Kenney Food Kit（CC0），GLB 與 `Textures/colormap.png` 放在 `client/public/models/food/`；手持時以 R3F `createPortal` 掛到角色的 `arm-right` 節點，位置與旋轉由 weapons.ts 的 `grip` 控制。

角色使用 Kenney Blocky Characters（CC0），GLB 與貼圖放在 `client/public/models/characters/`（GLB 以相對路徑引用 `Textures/`，兩者需一起搬動）。

聖誕小鎮與打雪仗場地使用 Kenney Holiday Kit（CC0），GLB 與 `Textures/colormap.png` 放在 `client/public/models/holiday/`。這個 kit 和家具一樣是半比例，放大 2 倍（`XMAS_UNIT`）才是公尺，實作時要注意：

- **木屋是模組化的，要自己拼**：牆片佔一格、外牆面固定在零件的 local z = +0.5；屋頂斜面是 45°，屋脊邊在 local x = -0.5、頂面 y = 1.283，順著 +X 降到 y = 0 時剛好 x = 0.783。所以牆高一格的屋子，屋頂零件的原點要放在 `1 - 0.283`，屋脊才會剛好落在山牆三角的頂點上
- **山牆三角只能靠 Y 軸旋轉鏡射**：`cabin-wall-roof` 的頂點固定在 local -X，右半用 rotY=0、左半用 rotY=π，左半的牆面因此要往 +Z 挪 0.5 才會落回同一個平面（用負縮放鏡射會讓 InstancedMesh 的面剔除反過來，不能用）
- **屋頂斜面不能一格一片**：斜面零件沿屋脊有 1.4 格深（兩端各留 0.2 出簷），一格卻只有 1.0，照格子鋪會讓相鄰兩片重疊 0.4，兩片一模一樣的斜面疊在一起就是整片 z-fighting。改成沿 Z 拉長成一片鋪完整條屋脊（煙囪那一片不能拉長，維持原尺寸貼在一端）
- **屋角柱要往外讓開**：柱子與牆的原木剖面相同、外表面只差 0.05，凹凸會互相穿插而閃爍，所以沿對角線往外挪 `CORNER_OUT`，讓柱子外表面明顯在牆之前、內側整個埋進牆裡
- **不是每個模型都能用同一個縮放**：×2 是拿木屋的門（2m 高）校準的，長椅照這個放大座面會到 0.9m，但角色坐姿的臀部只在 0.45m，人會陷進椅子裡。長椅因此單獨用 ×1（座面剛好 0.45m，與辦公室的椅子沙發一致），雪堡則放大到 ×2.4 才有腰部高度；各自的倍率集中在 `xmas.ts` 的 `XMAS_PROP_SCALE`
- **不要做 bounding box 置中**：`KitModel` 會置中，但模組化零件就是靠各自的原始原點才對得起來。`client/src/scene/HolidayKit.tsx` 直接用原點合批
- **合批與共用貼圖**：每個 GLB 都只有一個 mesh、一個名為 colormap 的材質，而且全部指向同一張 512x512 貼圖。`HolidayKit.tsx` 依模型分組成 InstancedMesh（約 190 個零件只要三十幾個 draw call），並讓所有模型共用第一個載到的材質，否則會上傳三十幾張一模一樣的貼圖
- 零件表在 `client/src/scene/christmasTownModel.ts`；木屋的位置、長度與開窗在 `shared/src/data/xmas.ts`，碰撞盒與「哪棵樹站在哪」在 `shared/src/data/furniture.ts`（`type: 'xmas'`），前後端讀同一份

場景主題背景使用 Kenney City Kit (Commercial)、Car Kit、Retro Urban Kit、Nature Kit（皆 CC0），只抽出用到的 GLB 放在 `client/public/models/scenes/<主題>/<kit>/`，同一資料夾內的 GLB 共用 `Textures/`（不同 kit 的 `colormap.png` 內容不同，所以依 kit 分夾）。Nature Kit 沒有貼圖、匯出時 `metallicFactor=1`，載入時一律改為非金屬並依材質名稱換色；同一 kit 內同名材質的貼圖只上傳一份

場景主題另外用了兩個外部下載模型（非 Kenney）：埃及的人面獅身（Crystal Palace Park 的攝影測量掃描）與日本的庭園。這類模型不能直接丟進場景，處理流程用 Blender CLI（`/Applications/Blender.app/Contents/MacOS/Blender --background --python x.py`）跑，要點：

- **減面**：獅身像原始 200 萬三角面，Decimate 到 12k
- **貼圖**：原始 8192×8192 用 `sips -Z 1024` 縮到 1024（8192 上到 GPU 是 268MB）
- **材質擴充**：three 0.180 的 GLTFLoader **完全不支援** `KHR_materials_pbrSpecularGlossiness`（庭園原本是這種，材質會整個變白），過一次 Blender 匯入匯出就轉成 metallic-roughness。另外 OBJ 的 `illum 4` 會讓 Blender 匯出 `KHR_materials_transmission`，three 會為它啟用昂貴的透射 pass，要移除
- **up-axis**：掃描模型常是 Z-up，Blender 的 OBJ importer 預設當成 Y-up，匯入後會躺倒；轉正時要直接變換 mesh data（`ob.data.transform(...)`），對物件設 `rotation_euler` 會被 glTF importer 建的 root empty 吃掉
- **draw call**：把所有 mesh join 成一個物件，匯出時會依材質拆 primitive，庭園從 95 個 mesh 降到 13 個

場景主題的效能與可見性由三件事決定，加新主題時要一起顧：

1. **背景模型合批**：`Scenery.tsx` 把同一個 GLB 的所有實例做成 InstancedMesh，draw call 只跟模型內的 mesh 數有關、與實例數無關；背景一律不投影不受影，切到該主題才下載、切走後釋放幾何與貼圖。
2. **primitive 地標合批**：`themes/parts.ts` 的 `PartBuilder` 先收集零件，最後依「顏色＋發光」合併成單一幾何。台灣街廓有近四十棟透天、上百台機車，不合批會是上千個 draw call。
3. **地標要放在看得見的地方**：相機是第三人稱跟隨，俯角 pitch、距離 D 時相機高度只有 `1 + D·sin(pitch)`，畫面上緣相對水平線的仰角是 `fov/2 − pitch`。所以地標的「角高度」超過 10° 頂端就被切掉，而預設俯角 35° 時地平線根本不在畫面裡。`layout.ts` 的 `landmarkHeight(距出生點, 角度)` 換算可見高度，`facingSpot(距離, 左右偏移)` 把地標擺在相機預設望出去的 −X−Z 方向（放別的方位再壯觀也不在畫面裡），`inViewCorridor()` 則讓佈點避開這條視線走廊，免得高樓把地標遮掉。

- `shared/src/data/avatars.ts` 決定可選角色與對應的 `character-x.glb`；套件共 18 個角色（a～r）全部啟用
- `client/src/scene/Avatar.tsx` 載入 GLB、縮放 0.65（約 1.75m）、把 unlit 材質轉為受光材質，並以 drei `useAnimations` 在 `idle` / `walk` / `sprint` 間 crossfade
- 坐下使用 `sit` clip（播到底後保持姿勢），表情使用 `emote-yes`、`emote-no`、`interact-right`（各播兩輪後自動回 idle）
- 格鬥：攻擊 `attack-melee-right`、被打 `pick-up`（前傾當作僵直）、倒地 `die`（保持最後一幀）；血液為 `client/src/scene/BloodParticles.tsx` 的 InstancedMesh 方塊粒子，沒有螢幕紅暈
