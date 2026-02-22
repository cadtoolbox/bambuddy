import { useTranslation } from 'react-i18next';

interface SpoolInfo {
  id: number;
  material: string;
  subtype: string | null;
  color_name: string | null;
  rgba: string | null;
  brand: string | null;
  label_weight: number;
  core_weight: number;
  weight_used: number;
}

interface SpoolInfoCardProps {
  spool: SpoolInfo;
}

export function SpoolInfoCard({ spool }: SpoolInfoCardProps) {
  const { t } = useTranslation();

  const remaining = Math.max(0, spool.label_weight - spool.weight_used);
  const pct = spool.label_weight > 0 ? Math.round((remaining / spool.label_weight) * 100) : 0;

  // Convert RRGGBBAA to CSS color
  const color = spool.rgba
    ? `#${spool.rgba.substring(0, 6)}`
    : '#808080';

  const materialLabel = spool.subtype
    ? `${spool.material} ${spool.subtype}`
    : spool.material;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div
          className="w-[48px] h-[48px] rounded-full border-2 border-bambu-dark-tertiary flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-[18px] font-semibold text-text-primary truncate">
            {materialLabel}
          </h3>
          <p className="text-[14px] text-text-secondary truncate">
            {[spool.brand, spool.color_name].filter(Boolean).join(' - ')}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-[14px]">
          <span className="text-text-secondary">{t('spoolbuddy.spool.remaining')}</span>
          <span className="text-text-primary font-medium">{remaining}g ({pct}%)</span>
        </div>
        <div className="w-full h-3 bg-bambu-dark-tertiary rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${pct}%`,
              backgroundColor: pct > 20 ? 'var(--accent)' : pct > 5 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      </div>
    </div>
  );
}
