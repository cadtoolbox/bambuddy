import { useTranslation } from 'react-i18next';
import { Button } from '../Button';

interface WeightDisplayProps {
  weightGrams: number | null;
  stable: boolean;
  rawAdc: number | null;
  onTare: () => void;
  onCalibrate: () => void;
}

export function WeightDisplay({ weightGrams, stable, onTare, onCalibrate }: WeightDisplayProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="flex-1 flex flex-col items-center justify-center">
        <span
          className="text-[72px] font-bold text-text-primary leading-none"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {weightGrams !== null ? weightGrams.toFixed(1) : '---'}
        </span>
        <span className="text-[24px] text-text-secondary mt-1">g</span>

        <div className="flex items-center gap-2 mt-3">
          <span className={`w-3 h-3 rounded-full ${
            weightGrams === null
              ? 'bg-bambu-gray'
              : stable
                ? 'bg-green-500'
                : 'bg-yellow-500 animate-pulse'
          }`} />
          <span className="text-[16px] text-text-secondary">
            {weightGrams === null
              ? t('spoolbuddy.weight.noReading')
              : stable
                ? t('spoolbuddy.weight.stable')
                : t('spoolbuddy.weight.measuring')}
          </span>
        </div>
      </div>

      <div className="w-full flex gap-3 pb-4">
        <Button
          variant="secondary"
          className="flex-1 h-[64px] text-[16px]"
          onClick={onTare}
        >
          {t('spoolbuddy.weight.tare')}
        </Button>
        <Button
          variant="secondary"
          className="flex-1 h-[64px] text-[16px]"
          onClick={onCalibrate}
        >
          {t('spoolbuddy.weight.calibrate')}
        </Button>
      </div>
    </div>
  );
}
