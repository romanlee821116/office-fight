/**
 * 角色頭上的對話泡泡（玩家與路人共用）。
 *
 * w-max 是必要的：泡泡和名牌同在一個 flex 直排裡，沒有它寬度會被名牌那一列撐住，
 * 短短一句話也會被折成好幾行。改成取內容寬度，超過 max-w 才換行。
 */
export function SpeechBubble({ text }: { text: string }) {
  return (
    <div className="relative w-max max-w-[400px] rounded-2xl bg-white px-3 py-1.5 text-[13px] leading-snug text-ink shadow-md break-words">
      {text}
      <span className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 bg-white" />
    </div>
  );
}
