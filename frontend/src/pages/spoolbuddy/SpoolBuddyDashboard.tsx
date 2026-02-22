import { useOutletContext } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { Scale, Nfc } from 'lucide-react';
import { WeightDisplay } from '../../components/spoolbuddy/WeightDisplay';
import { SpoolInfoCard } from '../../components/spoolbuddy/SpoolInfoCard';
import { UnknownTagCard } from '../../components/spoolbuddy/UnknownTagCard';
import { QuickActionGrid } from '../../components/spoolbuddy/QuickActionGrid';
import { useToast } from '../../contexts/ToastContext';
import { spoolBuddyApi } from '../../api/client';

interface SpoolBuddyState {
  view: 'idle' | 'tag_known' | 'tag_unknown';
  weight: { weight_grams: number; stable: boolean; raw_adc: number | null; device_id: string } | null;
  tag: { tag_uid: string; sak?: number; tag_type?: string; device_id: string } | null;
  spool: {
    id: number;
    material: string;
    subtype: string | null;
    color_name: string | null;
    rgba: string | null;
    brand: string | null;
    label_weight: number;
    core_weight: number;
    weight_used: number;
  } | null;
  deviceOnline: boolean;
}

export function SpoolBuddyDashboard() {
  const state = useOutletContext<SpoolBuddyState>();
  const { t } = useTranslation();
  const { showToast } = useToast();

  const updateWeightMutation = useMutation({
    mutationFn: (data: { spool_id: number; weight_grams: number }) =>
      spoolBuddyApi.updateSpoolWeight(data.spool_id, data.weight_grams),
    onSuccess: () => showToast(t('spoolbuddy.actions.weightUpdated'), 'success'),
    onError: () => showToast(t('common.error'), 'error'),
  });

  const handleUpdateWeight = () => {
    if (state.spool && state.weight) {
      updateWeightMutation.mutate({
        spool_id: state.spool.id,
        weight_grams: state.weight.weight_grams,
      });
    }
  };

  const handleTare = async () => {
    if (state.weight?.device_id) {
      try {
        await spoolBuddyApi.tare(state.weight.device_id);
        showToast(t('spoolbuddy.weight.tareQueued'), 'success');
      } catch {
        showToast(t('common.error'), 'error');
      }
    }
  };

  return (
    <div className="flex h-[512px]">
      {/* Left panel — Weight */}
      <div className="w-[512px] border-r border-bambu-dark-tertiary">
        <WeightDisplay
          weightGrams={state.weight?.weight_grams ?? null}
          stable={state.weight?.stable ?? false}
          rawAdc={state.weight?.raw_adc ?? null}
          onTare={handleTare}
          onCalibrate={() => {/* TODO: open calibration modal */}}
        />
      </div>

      {/* Right panel — Tag state */}
      <div className="w-[512px] p-6 overflow-y-auto">
        {state.view === 'idle' && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="flex gap-4 mb-6">
              <Scale size={48} className="text-text-muted" />
              <Nfc size={48} className="text-text-muted" />
            </div>
            <p className="text-[24px] text-text-secondary max-w-[360px]">
              {t('spoolbuddy.dashboard.idleMessage')}
            </p>
          </div>
        )}

        {state.view === 'tag_known' && state.spool && (
          <div className="flex flex-col h-full">
            <div className="flex-1">
              <SpoolInfoCard spool={state.spool} />
            </div>
            <QuickActionGrid
              onUpdateWeight={handleUpdateWeight}
              onEditSpool={() => {/* TODO: open spool form modal */}}
              onAssignAms={() => {/* TODO: open assign modal */}}
              onViewHistory={() => {/* TODO: navigate to history */}}
            />
          </div>
        )}

        {state.view === 'tag_unknown' && state.tag && (
          <UnknownTagCard
            tagUid={state.tag.tag_uid}
            sak={state.tag.sak}
            tagType={state.tag.tag_type}
            onLinkExisting={() => {/* TODO: open link modal */}}
            onCreateNew={() => {/* TODO: open create modal */}}
          />
        )}
      </div>
    </div>
  );
}
