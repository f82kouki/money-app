import { useEffect, useState } from "react";

interface Props {
  image: string;
  onClose: () => void;
}

const VISIBLE_MS = 2500; // 表示しておく時間（2〜3秒）
const FADE_MS = 300; // フェードイン/アウトの長さ

/** 記録成功後に表示するお祝い画像ダイアログ（ふわっと表示・ふわっと消える）。 */
export default function CelebrationDialog({ image, onClose }: Props) {
  const [shown, setShown] = useState(false);

  function fadeOut() {
    setShown(false);
    setTimeout(onClose, FADE_MS); // フェードアウト後に実際に閉じる
  }

  useEffect(() => {
    // 初回描画は opacity-0 → 次フレームで opacity-100 にしてフェードイン
    const raf = requestAnimationFrame(() => setShown(true));
    const timer = setTimeout(fadeOut, VISIBLE_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      onClick={fadeOut}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 transition-opacity ease-out ${
        shown ? "opacity-100" : "opacity-0"
      }`}
      style={{ transitionDuration: `${FADE_MS}ms` }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[85vh] max-w-[90vw] flex-col items-center transition-all ease-out ${
          shown ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
        style={{ transitionDuration: `${FADE_MS}ms` }}
      >
        <img
          src={image}
          alt="お祝い"
          className="max-h-[75vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}
