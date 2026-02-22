import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AmsSlotCard } from '../../components/spoolbuddy/AmsSlotCard';
import { api } from '../../api/client';

interface PrinterOption {
  id: number;
  name: string;
}

export function SpoolBuddyAmsPage() {
  const { t } = useTranslation();
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);

  const { data: printers } = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters,
  });

  const printerList = (printers || []) as PrinterOption[];
  const activePrinterId = selectedPrinterId ?? printerList[0]?.id ?? null;

  const { data: status } = useQuery({
    queryKey: ['printerStatus', activePrinterId],
    enabled: activePrinterId !== null,
  });

  const amsData = (status as Record<string, unknown>)?.ams as Record<string, unknown> | undefined;
  const amsUnits = amsData?.ams as Array<Record<string, unknown>> | undefined;
  return (
    <div className="h-[512px] p-4 overflow-y-auto">
      {/* Printer selector */}
      <div className="mb-4">
        <select
          value={activePrinterId ?? ''}
          onChange={(e) => setSelectedPrinterId(Number(e.target.value))}
          className="h-[48px] w-full bg-bg-secondary border border-bambu-dark-tertiary rounded-lg px-4 text-text-primary text-[14px]"
        >
          {printerList.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* AMS units */}
      {amsUnits ? (
        <div className="space-y-6">
          {amsUnits.map((ams, amsIdx) => {
            const trays = ams.tray as Array<Record<string, unknown>> | undefined;
            if (!trays) return null;
            const label = String.fromCharCode(65 + amsIdx); // A, B, C, D

            return (
              <div key={amsIdx}>
                <h3 className="text-[16px] font-semibold text-text-primary mb-2">AMS-{label}</h3>
                <div className="flex gap-2">
                  {trays.map((tray, trayIdx) => {
                    const trayType = tray.tray_type as string | undefined;
                    const trayColor = tray.tray_color as string | undefined;
                    const remain = tray.remain as number | undefined;
                    const isEmpty = !trayType || trayType === '';

                    return (
                      <AmsSlotCard
                        key={trayIdx}
                        material={trayType || null}
                        colorHex={trayColor || null}
                        colorName={null}
                        remaining={remain ?? null}
                        isEmpty={isEmpty}
                        onClick={() => {/* TODO: slot detail modal */}}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center justify-center h-[300px]">
          <p className="text-text-muted text-[16px]">{t('spoolbuddy.ams.noData')}</p>
        </div>
      )}
    </div>
  );
}
