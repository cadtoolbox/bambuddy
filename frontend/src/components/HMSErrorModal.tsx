import { useEffect } from 'react';
import { X, AlertTriangle, AlertCircle, Info, ExternalLink } from 'lucide-react';
import type { HMSError } from '../api/client';

interface HMSErrorModalProps {
  printerName: string;
  errors: HMSError[];
  onClose: () => void;
}

// HMS error code descriptions (common ones)
const HMS_DESCRIPTIONS: Record<string, string> = {
  '0x20054': 'The heatbed temperature is abnormal. The sensor may be disconnected or damaged.',
  '0x50005': 'Motor driver overheated. Let the printer cool down.',
  '0x50006': 'Motor driver communication error.',
  '0x70001': 'AMS communication error.',
  '0x70002': 'AMS filament runout.',
  '0x70003': 'AMS filament not detected.',
  '0xC0003': 'First layer inspection failed.',
  '0xC0004': 'Nozzle clog detected.',
  '0xC8000': 'Foreign object detected on print bed.',
  '0x50000': 'Motor X axis lost steps.',
  '0x50001': 'Motor Y axis lost steps.',
  '0x50002': 'Motor Z axis lost steps.',
};

function getSeverityInfo(severity: number): { label: string; color: string; bgColor: string; Icon: typeof AlertTriangle } {
  switch (severity) {
    case 1:
      return { label: 'Fatal', color: 'text-red-500', bgColor: 'bg-red-500/20', Icon: AlertTriangle };
    case 2:
      return { label: 'Serious', color: 'text-red-400', bgColor: 'bg-red-500/15', Icon: AlertTriangle };
    case 3:
      return { label: 'Warning', color: 'text-orange-400', bgColor: 'bg-orange-500/20', Icon: AlertCircle };
    case 4:
    default:
      return { label: 'Info', color: 'text-blue-400', bgColor: 'bg-blue-500/20', Icon: Info };
  }
}

function getHMSWikiUrl(code: string): string {
  // Convert hex code to format used by Bambu Lab wiki
  // Example: 0x20054 -> HMS_0200_0005_0004
  const codeNum = parseInt(code.replace('0x', ''), 16);
  const part1 = ((codeNum >> 24) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  const part2 = ((codeNum >> 16) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  const part3 = ((codeNum >> 8) & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  const part4 = (codeNum & 0xFF).toString(16).padStart(2, '0').toUpperCase();
  return `https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/HMS_${part1}${part2}_${part3}${part4}`;
}

export function HMSErrorModal({ printerName, errors, onClose }: HMSErrorModalProps) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bambu-dark-secondary rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-bambu-dark-tertiary">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-400" />
            <h2 className="text-lg font-semibold text-white">HMS Errors - {printerName}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-bambu-dark-tertiary rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-bambu-gray" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {errors.length === 0 ? (
            <div className="text-center py-8 text-bambu-gray">
              <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No HMS errors</p>
            </div>
          ) : (
            <div className="space-y-3">
              {errors.map((error, index) => {
                const { label, color, bgColor, Icon } = getSeverityInfo(error.severity);
                const description = HMS_DESCRIPTIONS[error.code] || 'Unknown error. Click the link below for details.';
                const wikiUrl = getHMSWikiUrl(error.code);

                return (
                  <div
                    key={`${error.code}-${index}`}
                    className={`p-4 rounded-lg ${bgColor} border border-white/10`}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className={`w-5 h-5 ${color} flex-shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`font-mono text-sm ${color}`}>{error.code}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${bgColor} ${color}`}>
                            {label}
                          </span>
                        </div>
                        <p className="text-sm text-bambu-gray mb-2">{description}</p>
                        <a
                          href={wikiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-bambu-green hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          View on Bambu Lab Wiki
                        </a>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-bambu-dark-tertiary">
          <p className="text-xs text-bambu-gray">
            HMS (Health Management System) monitors printer health. Clear errors on the printer to dismiss them here.
          </p>
        </div>
      </div>
    </div>
  );
}
