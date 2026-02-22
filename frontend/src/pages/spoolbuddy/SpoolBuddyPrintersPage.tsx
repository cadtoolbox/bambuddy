import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../api/client';

interface PrinterInfo {
  id: number;
  name: string;
  model: string;
  ip_address: string;
}

export function SpoolBuddyPrintersPage() {
  const { t } = useTranslation();

  const { data: printers } = useQuery({
    queryKey: ['printers'],
    queryFn: api.getPrinters,
  });

  const printerList = (printers || []) as PrinterInfo[];

  return (
    <div className="h-[512px] p-4 overflow-y-auto space-y-2">
      {printerList.map((printer) => {
        return (
          <PrinterCard key={printer.id} printer={printer} />
        );
      })}

      {printerList.length === 0 && (
        <div className="flex items-center justify-center h-[300px]">
          <p className="text-text-muted text-[16px]">{t('spoolbuddy.printers.noPrinters')}</p>
        </div>
      )}
    </div>
  );
}

function PrinterCard({ printer }: { printer: PrinterInfo }) {
  const { data: status } = useQuery({
    queryKey: ['printerStatus', printer.id],
  });

  const st = status as Record<string, unknown> | undefined;
  const isOnline = st?.online === true;
  const printPct = st?.mc_percent as number | undefined;
  const nozzleTemp = st?.nozzle_temper as number | undefined;
  const bedTemp = st?.bed_temper as number | undefined;

  return (
    <div className="p-4 bg-bg-secondary rounded-xl border border-bambu-dark-tertiary">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-bambu-gray'}`} />
          <h3 className="text-[16px] font-semibold text-text-primary">{printer.name}</h3>
        </div>
        <span className={`text-[13px] px-2 py-0.5 rounded ${isOnline ? 'bg-green-500/20 text-green-400' : 'bg-bambu-dark-tertiary text-text-muted'}`}>
          {isOnline ? 'Online' : 'Offline'}
        </span>
      </div>

      <div className="flex items-center gap-3 text-[13px] text-text-secondary">
        <span>{printer.model}</span>
        <span>{printer.ip_address}</span>
        {printPct !== undefined && printPct > 0 && (
          <span>Print: {printPct}%</span>
        )}
        {nozzleTemp !== undefined && bedTemp !== undefined && isOnline && (
          <span>{Math.round(nozzleTemp)}° / {Math.round(bedTemp)}°</span>
        )}
      </div>
    </div>
  );
}
