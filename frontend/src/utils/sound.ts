// 記録成功フィードバック用の効果音。
// 音源は public/sounds/ 配下の静的アセット。気に入らなければファイルを差し替えるだけでよい。
const chari = new Audio("/sounds/register.mp3");
chari.preload = "auto";

/**
 * “チャリン”を鳴らす。
 * - クリック（ユーザー操作）ハンドラ内から呼ぶ前提（自動再生ポリシー対策）。
 * - fire-and-forget: 再生に失敗しても例外は投げず、記録フローを止めない。
 * - currentTime をリセットしてから再生するので連打でも毎回鳴る。
 */
export function playChari(): void {
  try {
    chari.currentTime = 0;
    void chari.play().catch(() => {
      /* 自動再生ブロック等は無視（音が出なくても記録は成功させる） */
    });
  } catch {
    /* 同上 */
  }
}
