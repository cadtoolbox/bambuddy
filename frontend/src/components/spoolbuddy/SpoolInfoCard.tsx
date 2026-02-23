import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchedSpool } from '../../hooks/useSpoolBuddyState';
import { spoolbuddyApi } from '../../api/client';

interface SpoolInfoCardProps {
  spool: MatchedSpool;
  scaleWeight: number | null;
  weightStable: boolean;
  onClose?: () => void;
}

export function SpoolInfoCard({ spool, scaleWeight, weightStable, onClose }: SpoolInfoCardProps) {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);
  const [synced, setSynced] = useState(false);

  const remaining = Math.max(0, spool.label_weight - spool.weight_used);
  const remainingPct = spool.label_weight > 0 ? (remaining / spool.label_weight) * 100 : 0;
  const netWeight = scaleWeight !== null ? Math.max(0, scaleWeight - spool.core_weight) : null;

  const handleSyncWeight = async () => {
    if (scaleWeight === null || !weightStable) return;
    setSyncing(true);
    try {
      await spoolbuddyApi.updateSpoolWeight(spool.id, Math.round(scaleWeight));
      setSynced(true);
      setTimeout(() => setSynced(false), 3000);
    } catch (e) {
      console.error('Failed to sync weight:', e);
    } finally {
      setSyncing(false);
    }
  };

  const colorHex = spool.rgba ? `#${spool.rgba.slice(0, 6)}` : '#808080';

  return (
    <div className="bg-zinc-800 rounded-xl p-4 relative">
      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Header: color swatch + material info */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full border-2 border-zinc-700 shrink-0"
          style={{ backgroundColor: colorHex }}
        />
        <div className="min-w-0">
          <div className="text-base font-medium text-zinc-100 truncate">
            {spool.material}
            {spool.color_name && <span className="text-zinc-400 ml-1.5">- {spool.color_name}</span>}
          </div>
          {spool.brand && (
            <div className="text-sm text-zinc-400 truncate">{spool.brand}</div>
          )}
        </div>
      </div>

      {/* Remaining weight bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-zinc-400 mb-1">
          <span>{t('spoolbuddy.spool.remaining', 'Remaining')}</span>
          <span>{Math.round(remaining)}g / {spool.label_weight}g</span>
        </div>
        <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, remainingPct)}%`,
              backgroundColor: remainingPct > 50 ? '#22c55e' : remainingPct > 15 ? '#f59e0b' : '#ef4444',
            }}
          />
        </div>
      </div>

      {/* Weight details grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span className="text-zinc-500">{t('spoolbuddy.spool.labelWeight', 'Label')}</span>
          <span className="text-zinc-300">{spool.label_weight}g</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">{t('spoolbuddy.spool.coreWeight', 'Core')}</span>
          <span className="text-zinc-300">{spool.core_weight}g</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">{t('spoolbuddy.spool.scaleWeight', 'Scale')}</span>
          <span className="text-zinc-300">{scaleWeight !== null ? `${scaleWeight.toFixed(1)}g` : '--'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">{t('spoolbuddy.spool.netWeight', 'Net')}</span>
          <span className="text-zinc-300">{netWeight !== null ? `${netWeight.toFixed(1)}g` : '--'}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleSyncWeight}
          disabled={!weightStable || scaleWeight === null || syncing}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
            synced
              ? 'bg-green-600/20 text-green-400'
              : 'bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
        >
          {syncing ? t('common.saving', 'Saving...') : synced ? t('spoolbuddy.dashboard.weightSynced', 'Synced!') : t('spoolbuddy.dashboard.syncWeight', 'Sync Weight')}
        </button>
      </div>
    </div>
  );
}

interface UnknownTagCardProps {
  tagUid: string;
  onLinkSpool?: () => void;
  onClose?: () => void;
}

export function UnknownTagCard({ tagUid, onLinkSpool, onClose }: UnknownTagCardProps) {
  const { t } = useTranslation();

  return (
    <div className="bg-zinc-800 rounded-xl p-4 relative">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>
        <div>
          <div className="text-base font-medium text-zinc-100">{t('spoolbuddy.dashboard.unknownTag', 'Unknown Tag')}</div>
          <div className="text-xs text-zinc-500 font-mono">{tagUid}</div>
        </div>
      </div>

      <button
        onClick={onLinkSpool}
        className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-600 text-white hover:bg-amber-700 transition-colors min-h-[44px]"
      >
        {t('spoolbuddy.dashboard.linkSpool', 'Link to Spool')}
      </button>
    </div>
  );
}
