import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Printer, PrinterStatus } from '../../api/client';
import { X, RefreshCw, Loader2 } from 'lucide-react';
import { Card, CardContent } from '../Card';

interface PrinterPartsModalProps {
  printer: Printer;
  status: PrinterStatus | null | undefined;
  onClose: () => void;
}

// Convert API nozzle_type to display name
// Bambu nozzle codes: SS = Stainless Steel, HS = Hardened Steel, HH = Hardened Steel High-flow
function getNozzleTypeName(type: string): string {
  const upperType = type.toUpperCase();

  // Handle Bambu nozzle codes (e.g., HH01, HS00, SS00)
  if (upperType.startsWith('HH')) {
    return 'Hardened Steel';
  }
  if (upperType.startsWith('HS')) {
    return 'Hardened Steel';
  }
  if (upperType.startsWith('SS')) {
    return 'Stainless Steel';
  }

  // Handle full names from API
  switch (type) {
    case 'hardened_steel':
      return 'Hardened Steel';
    case 'stainless_steel':
      return 'Stainless Steel';
    default:
      return type || 'Unknown';
  }
}

// Determine flow type based on nozzle type code
// HH = High-flow, HS/SS = Standard
function getFlowType(type: string): string {
  const upperType = type.toUpperCase();
  if (upperType.startsWith('HH')) {
    return 'High flow';
  }
  return 'Standard';
}

export function PrinterPartsModal({ printer, status, onClose }: PrinterPartsModalProps) {
  const queryClient = useQueryClient();
  const isDualNozzle = printer.nozzle_count > 1;

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Get nozzle data from status
  // On H2D, both nozzles must be identical - if right nozzle is empty, copy from left
  const leftNozzle = status?.nozzles?.[0];
  const rightNozzleRaw = status?.nozzles?.[1];
  const rightNozzle = (rightNozzleRaw?.nozzle_type || rightNozzleRaw?.nozzle_diameter)
    ? rightNozzleRaw
    : leftNozzle;

  // Refresh mutation - sends pushall command to printer
  const refreshMutation = useMutation({
    mutationFn: () => api.refreshStatus(printer.id),
    onSuccess: () => {
      // Invalidate queries to get updated data
      queryClient.invalidateQueries({ queryKey: ['printerStatuses'] });
    },
  });

  const handleRefresh = () => {
    refreshMutation.mutate();
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <Card className="w-full max-w-2xl" onClick={(e: React.MouseEvent) => e.stopPropagation()}>
        <CardContent className="p-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-bambu-dark-tertiary">
            <span className="text-sm font-medium text-white">Printer Parts</span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-bambu-dark-tertiary text-bambu-gray hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Left Nozzle */}
            <div>
              <h3 className="text-base font-semibold text-white mb-3">
                {isDualNozzle ? 'Left Nozzle' : 'Nozzle'}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-bambu-gray mb-1.5">Type</label>
                  <div className="px-3 py-2 bg-bambu-dark rounded border border-bambu-dark-tertiary text-sm text-bambu-gray">
                    {getNozzleTypeName(leftNozzle?.nozzle_type || '')}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-bambu-gray mb-1.5">Diameter</label>
                  <div className="px-3 py-2 bg-bambu-dark rounded border border-bambu-dark-tertiary text-sm text-bambu-gray">
                    {leftNozzle?.nozzle_diameter || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-bambu-gray mb-1.5">Flow</label>
                  <div className="px-3 py-2 bg-bambu-dark rounded border border-bambu-dark-tertiary text-sm text-bambu-gray">
                    {getFlowType(leftNozzle?.nozzle_type || '')}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Nozzle - only for dual nozzle printers */}
            {isDualNozzle && (
              <div>
                <h3 className="text-base font-semibold text-white mb-3">Right Nozzle</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1.5">Type</label>
                    <div className="px-3 py-2 bg-bambu-dark rounded border border-bambu-dark-tertiary text-sm text-bambu-gray">
                      {getNozzleTypeName(rightNozzle?.nozzle_type || '')}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1.5">Diameter</label>
                    <div className="px-3 py-2 bg-bambu-dark rounded border border-bambu-dark-tertiary text-sm text-bambu-gray">
                      {rightNozzle?.nozzle_diameter || '—'}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-bambu-gray mb-1.5">Flow</label>
                    <div className="px-3 py-2 bg-bambu-dark rounded border border-bambu-dark-tertiary text-sm text-bambu-gray">
                      {getFlowType(rightNozzle?.nozzle_type || '')}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Info text */}
            <p className="text-sm text-bambu-gray">
              Please change the nozzle settings on the printer.{' '}
              <a
                href="https://wiki.bambulab.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-bambu-green hover:underline"
              >
                View wiki
              </a>
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end px-4 py-3 border-t border-bambu-dark-tertiary">
            <button
              onClick={handleRefresh}
              disabled={refreshMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-bambu-green hover:bg-bambu-green-dark disabled:opacity-50 text-white text-sm font-medium rounded"
            >
              {refreshMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Refresh
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
