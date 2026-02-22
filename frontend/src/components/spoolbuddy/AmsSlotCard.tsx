interface AmsSlotCardProps {
  material: string | null;
  colorHex: string | null;
  colorName: string | null;
  remaining: number | null;
  isEmpty: boolean;
  onClick: () => void;
}

export function AmsSlotCard({ material, colorHex, remaining, isEmpty, onClick }: AmsSlotCardProps) {
  const color = colorHex ? `#${colorHex.substring(0, 6)}` : '#808080';

  return (
    <button
      onClick={onClick}
      className="w-[120px] h-[120px] rounded-xl border border-bambu-dark-tertiary bg-bg-secondary flex flex-col items-center justify-center gap-2 active:bg-bambu-dark-tertiary transition-colors"
    >
      {isEmpty ? (
        <span className="text-text-muted text-[13px]">Empty</span>
      ) : (
        <>
          <div
            className="w-[48px] h-[48px] rounded-full border-2 border-bambu-dark-tertiary"
            style={{ backgroundColor: color }}
          />
          <span className="text-text-primary text-[13px] font-medium truncate max-w-[100px]">
            {material || '---'}
          </span>
          {remaining !== null && remaining >= 0 && (
            <div className="w-[80px] h-1.5 bg-bambu-dark-tertiary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-bambu-green"
                style={{ width: `${Math.min(100, remaining)}%` }}
              />
            </div>
          )}
        </>
      )}
    </button>
  );
}
