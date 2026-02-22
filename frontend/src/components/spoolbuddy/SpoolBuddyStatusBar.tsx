import { useTranslation } from 'react-i18next';
import { Scale, Nfc } from 'lucide-react';

interface SpoolBuddyStatusBarProps {
  weightGrams: number | null;
  stable: boolean;
  nfcOk: boolean;
  deviceOnline: boolean;
}

export function SpoolBuddyStatusBar({ weightGrams, stable, nfcOk, deviceOnline }: SpoolBuddyStatusBarProps) {
  const { t } = useTranslation();

  return (
    <div className="h-[40px] bg-bg-secondary border-t border-bambu-dark-tertiary flex items-center px-4 text-[13px]">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2">
          <Scale size={14} className="text-text-secondary" />
          <span className="text-text-primary font-mono">
            {weightGrams !== null ? `${weightGrams.toFixed(1)}g` : '---'}
          </span>
          {weightGrams !== null && (
            <span className={`w-2 h-2 rounded-full ${stable ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} />
          )}
        </div>

        <div className="flex items-center gap-2">
          <Nfc size={14} className="text-text-secondary" />
          <span className={nfcOk ? 'text-green-500' : 'text-text-muted'}>
            {nfcOk ? t('spoolbuddy.status.nfcReady') : t('spoolbuddy.status.nfcOff')}
          </span>
        </div>

        {!deviceOnline && (
          <span className="text-red-400 text-[12px]">{t('spoolbuddy.status.offline')}</span>
        )}
      </div>

      <span className="text-text-muted text-[12px]">SpoolBuddy</span>
    </div>
  );
}
