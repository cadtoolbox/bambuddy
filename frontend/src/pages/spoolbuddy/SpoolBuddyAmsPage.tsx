import { useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { SpoolBuddyOutletContext } from '../../components/spoolbuddy/SpoolBuddyLayout';
import type { PrinterStatus } from '../../api/client';
import { AmsUnitCard } from '../../components/spoolbuddy/AmsUnitCard';

export function SpoolBuddyAmsPage() {
  const { selectedPrinterId } = useOutletContext<SpoolBuddyOutletContext>();
  const { t } = useTranslation();

  const { data: status } = useQuery<PrinterStatus>({
    queryKey: ['printerStatus', selectedPrinterId],
    enabled: selectedPrinterId !== null,
  });

  const amsUnits = status?.ams ?? [];
  const trayNow = status?.tray_now ?? 255;

  const getActiveSlotForAms = (amsId: number): number | null => {
    if (trayNow === 255 || trayNow === 254) return null;
    if (amsId <= 3) {
      const activeAmsId = Math.floor(trayNow / 4);
      if (activeAmsId === amsId) return trayNow % 4;
    }
    return null;
  };

  return (
    <div className="h-full flex flex-col p-4">
      <h1 className="text-lg font-semibold text-zinc-100 mb-4">
        {t('spoolbuddy.nav.ams', 'AMS')}
      </h1>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selectedPrinterId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-zinc-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              <p className="text-lg mb-1">{t('spoolbuddy.ams.noPrinter', 'No printer selected')}</p>
              <p className="text-sm">{t('spoolbuddy.ams.selectPrinter', 'Select a printer from the top bar')}</p>
            </div>
          </div>
        ) : amsUnits.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-zinc-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-lg mb-1">{t('spoolbuddy.ams.noData', 'No AMS detected')}</p>
              <p className="text-sm">{t('spoolbuddy.ams.connectAms', 'Connect an AMS to see filament slots')}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {amsUnits.map((unit) => (
              <AmsUnitCard
                key={unit.id}
                unit={unit}
                activeSlot={getActiveSlotForAms(unit.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
