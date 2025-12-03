import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Printer, PrinterStatus } from '../../api/client';
import { X, AlertTriangle } from 'lucide-react';

interface SpeedModalProps {
  printer: Printer;
  status: PrinterStatus | null | undefined;
  onClose: () => void;
}

type SpeedMode = 1 | 2 | 3 | 4;

interface SpeedOption {
  mode: SpeedMode;
  name: string;
  description: string;
  percentage: string;
}

const SPEED_OPTIONS: SpeedOption[] = [
  { mode: 1, name: 'Silent', description: 'Quieter printing, slower speed', percentage: '50%' },
  { mode: 2, name: 'Standard', description: 'Balanced speed and quality', percentage: '100%' },
  { mode: 3, name: 'Sport', description: 'Faster printing, moderate noise', percentage: '124%' },
  { mode: 4, name: 'Ludicrous', description: 'Maximum speed', percentage: '166%' },
];

export function SpeedModal({ printer, status, onClose }: SpeedModalProps) {
  const isConnected = status?.connected ?? false;
  const isPrinting = status?.state === 'RUNNING' || status?.state === 'PRINTING';
  // Speed can only be changed during a print
  const isDisabled = !isConnected || !isPrinting;

  // Initialize from printer status
  const initialSpeed = (status?.speed_level ?? 2) as SpeedMode;
  const [selectedSpeed, setSelectedSpeed] = useState<SpeedMode>(initialSpeed);

  const speedMutation = useMutation({
    mutationFn: (mode: number) => api.setPrintSpeed(printer.id, mode),
  });

  const handleSpeedChange = (mode: SpeedMode) => {
    if (mode === selectedSpeed || isDisabled) return;
    setSelectedSpeed(mode);
    speedMutation.mutate(mode);
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md bg-bambu-dark-secondary rounded-2xl shadow-2xl border border-bambu-dark-tertiary overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-bambu-dark border-b border-bambu-dark-tertiary">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-bambu-green/20 flex items-center justify-center">
              <img src="/icons/speed.svg" alt="" className="w-5 h-5 icon-green" />
            </div>
            <span className="text-base font-semibold text-white">Print Speed</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-bambu-gray hover:bg-bambu-dark-tertiary hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Info Banner */}
          {!isPrinting ? (
            <div className="flex items-center gap-2 p-3 bg-bambu-dark border border-bambu-dark-tertiary rounded-lg">
              <AlertTriangle className="w-4 h-4 text-bambu-gray flex-shrink-0" />
              <span className="text-xs text-bambu-gray">
                No print in progress. Speed can only be changed during printing.
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <span className="text-xs text-yellow-500">
                Speed changes take effect immediately.
              </span>
            </div>
          )}

          {/* Speed Options */}
          <div className="space-y-2">
            {SPEED_OPTIONS.map((option) => (
              <button
                key={option.mode}
                onClick={() => handleSpeedChange(option.mode)}
                disabled={isDisabled || speedMutation.isPending}
                className={`w-full p-4 rounded-xl flex items-center justify-between transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  selectedSpeed === option.mode
                    ? 'bg-bambu-green text-white shadow-lg'
                    : 'bg-bambu-dark text-bambu-gray hover:text-white hover:bg-bambu-dark-tertiary border border-bambu-dark-tertiary'
                }`}
              >
                <div className="flex flex-col items-start">
                  <span className="font-medium">{option.name}</span>
                  <span className={`text-xs ${selectedSpeed === option.mode ? 'text-white/80' : 'text-bambu-gray'}`}>
                    {option.description}
                  </span>
                </div>
                <span className={`text-lg font-semibold ${selectedSpeed === option.mode ? 'text-white' : 'text-bambu-gray'}`}>
                  {option.percentage}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
