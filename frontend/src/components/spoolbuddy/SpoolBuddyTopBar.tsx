import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, type Printer } from '../../api/client';

interface SpoolBuddyTopBarProps {
  selectedPrinterId: number | null;
  onPrinterChange: (id: number) => void;
  deviceOnline: boolean;
}

export function SpoolBuddyTopBar({ selectedPrinterId, onPrinterChange, deviceOnline }: SpoolBuddyTopBarProps) {
  const { t } = useTranslation();
  const [currentTime, setCurrentTime] = useState(new Date());

  const { data: printers = [] } = useQuery({
    queryKey: ['printers'],
    queryFn: () => api.getPrinters(),
  });

  // Auto-select first printer
  useEffect(() => {
    if (!selectedPrinterId && printers.length > 0) {
      onPrinterChange(printers[0].id);
    }
  }, [printers, selectedPrinterId, onPrinterChange]);

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="h-11 bg-zinc-950 border-b border-zinc-800 flex items-center px-3 gap-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-6 h-6 rounded bg-green-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </div>
        <span className="text-white font-semibold text-sm hidden sm:inline">SpoolBuddy</span>
      </div>

      {/* Printer selector - centered */}
      <div className="flex-1 flex justify-center">
        <select
          value={selectedPrinterId ?? ''}
          onChange={(e) => onPrinterChange(Number(e.target.value))}
          className="bg-zinc-800 text-white text-sm px-3 py-1.5 rounded border border-zinc-700 focus:outline-none focus:border-green-500 min-w-[150px]"
        >
          {printers.length === 0 ? (
            <option value="">{t('spoolbuddy.status.noPrinters', 'No printers')}</option>
          ) : (
            printers.map((printer: Printer) => (
              <option key={printer.id} value={printer.id}>
                {printer.name}
              </option>
            ))
          )}
        </select>
      </div>

      {/* Right side indicators */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Device LED */}
        <div className="flex items-center gap-1.5" title={deviceOnline ? t('spoolbuddy.status.online', 'Online') : t('spoolbuddy.status.offline', 'Offline')}>
          <div className={`w-2.5 h-2.5 rounded-full ${deviceOnline ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.5)]' : 'bg-zinc-600'}`} />
          <span className="text-xs text-zinc-400">{deviceOnline ? t('spoolbuddy.status.online', 'Online') : t('spoolbuddy.status.offline', 'Offline')}</span>
        </div>

        {/* Clock */}
        <span className="text-zinc-400 text-sm font-mono min-w-[50px] text-right">
          {formatTime(currentTime)}
        </span>
      </div>
    </div>
  );
}
