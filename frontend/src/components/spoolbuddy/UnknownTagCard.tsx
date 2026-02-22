import { useTranslation } from 'react-i18next';
import { Button } from '../Button';
import { AlertTriangle } from 'lucide-react';

interface UnknownTagCardProps {
  tagUid: string;
  sak?: number;
  tagType?: string;
  onLinkExisting: () => void;
  onCreateNew: () => void;
}

export function UnknownTagCard({ tagUid, sak, tagType, onLinkExisting, onCreateNew }: UnknownTagCardProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      <AlertTriangle size={48} className="text-yellow-500 mb-4" />
      <h3 className="text-[24px] font-semibold text-text-primary mb-2">
        {t('spoolbuddy.tag.unknownTitle')}
      </h3>
      <p className="text-[14px] text-text-secondary mb-1 font-mono">{tagUid}</p>
      {tagType && (
        <p className="text-[13px] text-text-muted mb-6">
          {tagType}{sak !== undefined ? ` (SAK: 0x${sak.toString(16).toUpperCase().padStart(2, '0')})` : ''}
        </p>
      )}

      <div className="w-full space-y-3 max-w-[320px]">
        <Button
          variant="primary"
          className="w-full h-[64px] text-[16px]"
          onClick={onLinkExisting}
        >
          {t('spoolbuddy.tag.linkExisting')}
        </Button>
        <Button
          variant="secondary"
          className="w-full h-[64px] text-[16px]"
          onClick={onCreateNew}
        >
          {t('spoolbuddy.tag.createNew')}
        </Button>
      </div>
    </div>
  );
}
