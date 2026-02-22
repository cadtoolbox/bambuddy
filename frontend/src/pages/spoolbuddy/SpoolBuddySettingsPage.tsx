import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/Button';
import { useToast } from '../../contexts/ToastContext';
import { spoolBuddyApi } from '../../api/client';

interface SpoolBuddyState {
  weight: { weight_grams: number; stable: boolean; raw_adc: number | null; device_id: string } | null;
  deviceOnline: boolean;
}

interface DeviceInfo {
  device_id: string;
  hostname: string;
  ip_address: string;
  firmware_version: string | null;
  tare_offset: number;
  calibration_factor: number;
  nfc_ok: boolean;
  scale_ok: boolean;
  uptime_s: number;
  online: boolean;
}

export function SpoolBuddySettingsPage() {
  const state = useOutletContext<SpoolBuddyState>();
  const { t } = useTranslation();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [knownWeight, setKnownWeight] = useState('500');

  const { data: devices } = useQuery({
    queryKey: ['spoolbuddy-devices'],
    queryFn: spoolBuddyApi.getDevices,
  });

  const deviceList = (devices || []) as DeviceInfo[];
  const device = deviceList[0]; // Primary device
  const deviceId = device?.device_id ?? state.weight?.device_id;

  const tareMutation = useMutation({
    mutationFn: () => spoolBuddyApi.tare(deviceId!),
    onSuccess: () => {
      showToast(t('spoolbuddy.settings.tareQueued'), 'success');
      queryClient.invalidateQueries({ queryKey: ['spoolbuddy-devices'] });
    },
    onError: () => showToast(t('common.error'), 'error'),
  });

  const calibrateMutation = useMutation({
    mutationFn: () =>
      spoolBuddyApi.setCalibrationFactor(deviceId!, parseFloat(knownWeight), state.weight?.raw_adc ?? 0),
    onSuccess: () => {
      showToast(t('spoolbuddy.settings.calibrated'), 'success');
      queryClient.invalidateQueries({ queryKey: ['spoolbuddy-devices'] });
    },
    onError: () => showToast(t('common.error'), 'error'),
  });

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="h-[512px] p-4 overflow-y-auto space-y-4">
      {/* Scale Calibration */}
      <section>
        <h2 className="text-[18px] font-semibold text-text-primary mb-3">
          {t('spoolbuddy.settings.scaleCalibration')}
        </h2>
        <div className="bg-bg-secondary rounded-xl border border-bambu-dark-tertiary p-4 space-y-4">
          <div className="flex justify-between text-[14px]">
            <span className="text-text-secondary">{t('spoolbuddy.settings.currentWeight')}</span>
            <span className="text-text-primary font-mono">
              {state.weight ? `${state.weight.weight_grams.toFixed(1)}g (raw: ${state.weight.raw_adc ?? '---'})` : '---'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-[14px] text-text-secondary">
              {t('spoolbuddy.settings.tareOffset')}: {device?.tare_offset ?? '---'}
            </span>
            <Button
              variant="secondary"
              className="h-[48px] px-6"
              onClick={() => tareMutation.mutate()}
              disabled={!deviceId || tareMutation.isPending}
            >
              {t('spoolbuddy.weight.tare')}
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[14px] text-text-secondary whitespace-nowrap">
              {t('spoolbuddy.settings.knownWeight')}:
            </span>
            <input
              type="number"
              value={knownWeight}
              onChange={(e) => setKnownWeight(e.target.value)}
              className="h-[48px] w-[120px] bg-bg-primary border border-bambu-dark-tertiary rounded-lg px-3 text-text-primary text-[14px] text-right"
            />
            <span className="text-[14px] text-text-secondary">g</span>
            <Button
              variant="secondary"
              className="h-[48px] px-6 ml-auto"
              onClick={() => calibrateMutation.mutate()}
              disabled={!deviceId || !state.weight?.raw_adc || calibrateMutation.isPending}
            >
              {t('spoolbuddy.weight.calibrate')}
            </Button>
          </div>
        </div>
      </section>

      {/* NFC Reader */}
      <section>
        <h2 className="text-[18px] font-semibold text-text-primary mb-3">
          {t('spoolbuddy.settings.nfcReader')}
        </h2>
        <div className="bg-bg-secondary rounded-xl border border-bambu-dark-tertiary p-4">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${device?.nfc_ok ? 'bg-green-500' : 'bg-bambu-gray'}`} />
            <span className="text-[14px] text-text-primary">
              {device?.nfc_ok ? t('spoolbuddy.settings.nfcConnected') : t('spoolbuddy.settings.nfcDisconnected')}
            </span>
          </div>
        </div>
      </section>

      {/* Device Info */}
      {device && (
        <section>
          <h2 className="text-[18px] font-semibold text-text-primary mb-3">
            {t('spoolbuddy.settings.deviceInfo')}
          </h2>
          <div className="bg-bg-secondary rounded-xl border border-bambu-dark-tertiary p-4 text-[14px] space-y-2">
            <div className="flex justify-between">
              <span className="text-text-secondary">{t('spoolbuddy.settings.deviceId')}</span>
              <span className="text-text-primary font-mono">{device.device_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">IP</span>
              <span className="text-text-primary">{device.ip_address}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">{t('spoolbuddy.settings.uptime')}</span>
              <span className="text-text-primary">{formatUptime(device.uptime_s)}</span>
            </div>
            {device.firmware_version && (
              <div className="flex justify-between">
                <span className="text-text-secondary">{t('spoolbuddy.settings.firmware')}</span>
                <span className="text-text-primary">{device.firmware_version}</span>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
