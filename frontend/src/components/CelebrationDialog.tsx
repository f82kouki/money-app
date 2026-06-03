interface Props {
  image: string;
  onClose: () => void;
}

/** 記録成功後に表示するお祝い画像ダイアログ（中央に画像 + 閉じるボタン）。 */
export default function CelebrationDialog({ image, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85vh] max-w-[90vw] flex-col items-center"
      >
        {/* 閉じる（右上） */}
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute -right-2 -top-2 z-10 rounded-full bg-white p-1.5 text-slate-600 shadow-md"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="18" y1="6" x2="6" y2="18" />
          </svg>
        </button>

        <img
          src={image}
          alt="お祝い"
          className="max-h-[75vh] max-w-[90vw] rounded-2xl object-contain shadow-2xl"
        />

        <button
          type="button"
          onClick={onClose}
          className="mt-4 rounded-xl bg-white px-8 py-3 text-base font-semibold text-primary-text shadow active:bg-primary-light"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
