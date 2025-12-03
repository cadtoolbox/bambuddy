import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { Printer, PrinterStatus } from '../../api/client';
import { X, Minus, Plus, Wind, Flame, AlertTriangle } from 'lucide-react';

interface AirConditionModalProps {
  printer: Printer;
  status: PrinterStatus | null | undefined;
  onClose: () => void;
}

type Mode = 'cooling' | 'heating';

// Toggle switch component
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`w-11 h-6 rounded-full relative transition-all shadow-inner border ${
        checked ? 'bg-bambu-green border-bambu-green' : 'bg-bambu-dark-tertiary border-bambu-dark-tertiary'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <div
        className={`w-5 h-5 rounded-full bg-white shadow-md absolute top-0.5 transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// Fan control card component
function FanCard({
  name,
  icon,
  speed,
  enabled,
  onToggle,
  onSpeedChange,
  disabled,
  showSpeedControl = true,
}: {
  name: string;
  icon: React.ReactNode;
  speed: number;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSpeedChange: (speed: number) => void;
  disabled?: boolean;
  showSpeedControl?: boolean;
}) {
  const increment = () => {
    const newSpeed = Math.min(100, speed + 10);
    onSpeedChange(newSpeed);
  };

  const decrement = () => {
    const newSpeed = Math.max(0, speed - 10);
    onSpeedChange(newSpeed);
  };

  return (
    <div className="bg-bambu-dark rounded-xl p-4 shadow-lg border border-bambu-dark-tertiary/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-bambu-dark-tertiary flex items-center justify-center">
            {icon}
          </div>
          <span className="text-white font-medium">{name}</span>
        </div>
        {showSpeedControl && (
          <Toggle checked={enabled} onChange={onToggle} disabled={disabled} />
        )}
      </div>

      {/* Controls or Status */}
      {showSpeedControl ? (
        <div className="flex items-center justify-between bg-bambu-dark-secondary rounded-lg p-2">
          <button
            onClick={decrement}
            disabled={disabled || !enabled}
            className="w-9 h-9 rounded-lg bg-bambu-dark-tertiary flex items-center justify-center text-white hover:bg-bambu-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="flex-1 text-center">
            <span className={`text-xl font-semibold ${enabled ? 'text-white' : 'text-bambu-gray'}`}>
              {speed}%
            </span>
          </div>
          <button
            onClick={increment}
            disabled={disabled || !enabled}
            className="w-9 h-9 rounded-lg bg-bambu-dark-tertiary flex items-center justify-center text-white hover:bg-bambu-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="p-3 text-center">
          <span className={`text-xl font-semibold ${enabled ? 'text-bambu-green' : 'text-bambu-green'}`}>
            {enabled ? 'Auto' : 'Off'}
          </span>
        </div>
      )}
    </div>
  );
}

// Warning dialog component
function PrintWarningDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-10 rounded-2xl">
      <div className="bg-bambu-dark-secondary rounded-xl p-5 m-4 max-w-sm border border-bambu-dark-tertiary shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-yellow-500" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Print in Progress</h3>
            <p className="text-sm text-bambu-gray">The printer is currently controlling air conditioning.</p>
          </div>
        </div>
        <p className="text-sm text-bambu-gray mb-5">
          Changing these settings during a print may affect print quality. Are you sure you want to continue?
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-lg font-medium text-sm bg-bambu-dark-tertiary text-white hover:bg-bambu-dark transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-lg font-medium text-sm bg-yellow-600 text-white hover:bg-yellow-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export function AirConditionModal({ printer, status, onClose }: AirConditionModalProps) {
  const isConnected = status?.connected ?? false;
  const isPrinting = status?.state === 'RUNNING' || status?.state === 'PRINTING';
  const isDisabled = !isConnected;

  // Initialize mode from printer status (0=cooling, 1=heating)
  const initialMode: Mode = (status?.airduct_mode ?? 0) === 1 ? 'heating' : 'cooling';
  const [mode, setMode] = useState<Mode>(initialMode);
  const [showPrintWarning, setShowPrintWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  // Fan states
  const [partFanEnabled, setPartFanEnabled] = useState(false);
  const [partFanSpeed, setPartFanSpeed] = useState(0);
  const [auxFanEnabled, setAuxFanEnabled] = useState(false);
  const [auxFanSpeed, setAuxFanSpeed] = useState(0);
  const [exhaustFanEnabled, setExhaustFanEnabled] = useState(false);
  const [exhaustFanSpeed, setExhaustFanSpeed] = useState(0);

  // Mutation for airduct mode
  const airductMutation = useMutation({
    mutationFn: (newMode: Mode) => api.setAirductMode(printer.id, newMode),
  });

  // Mutations for fan control
  const partFanMutation = useMutation({
    mutationFn: (speed: number) => api.setPartFan(printer.id, speed),
  });

  const auxFanMutation = useMutation({
    mutationFn: (speed: number) => api.setAuxFan(printer.id, speed),
  });

  const chamberFanMutation = useMutation({
    mutationFn: (speed: number) => api.setChamberFan(printer.id, speed),
  });

  // Wrapper to check for print warning before executing action
  const withPrintWarning = (action: () => void) => {
    if (isPrinting) {
      setPendingAction(() => action);
      setShowPrintWarning(true);
    } else {
      action();
    }
  };

  const handleWarningConfirm = () => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
    setShowPrintWarning(false);
  };

  const handleWarningCancel = () => {
    setPendingAction(null);
    setShowPrintWarning(false);
  };

  // Handle mode change
  const handleModeChange = (newMode: Mode) => {
    if (newMode === mode) return;

    withPrintWarning(() => {
      setMode(newMode);
      airductMutation.mutate(newMode);
    });
  };

  const handlePartFanToggle = (enabled: boolean) => {
    withPrintWarning(() => {
      setPartFanEnabled(enabled);
      if (!enabled) {
        setPartFanSpeed(0);
        partFanMutation.mutate(0);
      }
    });
  };

  const handlePartFanSpeed = (speed: number) => {
    withPrintWarning(() => {
      setPartFanSpeed(speed);
      setPartFanEnabled(speed > 0);
      partFanMutation.mutate(speed);
    });
  };

  const handleAuxFanToggle = (enabled: boolean) => {
    withPrintWarning(() => {
      setAuxFanEnabled(enabled);
      if (!enabled) {
        setAuxFanSpeed(0);
        auxFanMutation.mutate(0);
      }
    });
  };

  const handleAuxFanSpeed = (speed: number) => {
    withPrintWarning(() => {
      setAuxFanSpeed(speed);
      setAuxFanEnabled(speed > 0);
      auxFanMutation.mutate(speed);
    });
  };

  const handleExhaustFanToggle = (enabled: boolean) => {
    withPrintWarning(() => {
      setExhaustFanEnabled(enabled);
      if (!enabled) {
        setExhaustFanSpeed(0);
        chamberFanMutation.mutate(0);
      }
    });
  };

  const handleExhaustFanSpeed = (speed: number) => {
    withPrintWarning(() => {
      setExhaustFanSpeed(speed);
      setExhaustFanEnabled(speed > 0);
      chamberFanMutation.mutate(speed);
    });
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showPrintWarning) {
          handleWarningCancel();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, showPrintWarning]);

  const modeDescriptions = {
    cooling: 'Suitable for PLA, PETG, TPU. Filters and cools the chamber air.',
    heating: 'Suitable for ABS, ASA, PC, PA. Circulates and heats chamber air.',
  };

  const FanIcon = () => (
    <img src="/icons/ventilation.svg" alt="" className="w-5 h-5 icon-theme" />
  );

  const HeatIcon = () => (
    <img src="/icons/chamber.svg" alt="" className="w-5 h-5 icon-theme" />
  );

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg bg-bambu-dark-secondary rounded-2xl shadow-2xl border border-bambu-dark-tertiary overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Print Warning Overlay */}
        {showPrintWarning && (
          <PrintWarningDialog
            onConfirm={handleWarningConfirm}
            onCancel={handleWarningCancel}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-bambu-dark border-b border-bambu-dark-tertiary">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-bambu-green/20 flex items-center justify-center">
              <img src="/icons/ventilation.svg" alt="" className="w-5 h-5 icon-green" />
            </div>
            <span className="text-base font-semibold text-white">Air Condition</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-bambu-gray hover:bg-bambu-dark-tertiary hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-5">
          {/* Print Warning Banner */}
          {isPrinting && (
            <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-yellow-500 flex-shrink-0" />
              <span className="text-xs text-yellow-500">
                Print in progress. Changes may affect print quality.
              </span>
            </div>
          )}

          {/* Mode Toggle */}
          <div className="bg-bambu-dark rounded-xl p-1.5 flex gap-1.5 shadow-inner">
            <button
              onClick={() => handleModeChange('cooling')}
              disabled={isDisabled || airductMutation.isPending}
              className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-50 ${
                mode === 'cooling'
                  ? 'bg-bambu-green text-white shadow-lg'
                  : 'text-bambu-gray hover:text-white hover:bg-bambu-dark-tertiary'
              }`}
            >
              <Wind className="w-4 h-4" />
              Cooling
            </button>
            <button
              onClick={() => handleModeChange('heating')}
              disabled={isDisabled || airductMutation.isPending}
              className={`flex-1 py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-all disabled:opacity-50 ${
                mode === 'heating'
                  ? 'bg-bambu-green text-white shadow-lg'
                  : 'text-bambu-gray hover:text-white hover:bg-bambu-dark-tertiary'
              }`}
            >
              <Flame className="w-4 h-4" />
              Heating
            </button>
          </div>

          {/* Mode Description */}
          <p className="text-sm text-bambu-gray text-center px-2">{modeDescriptions[mode]}</p>

          {/* Separator */}
          <div className="border-t border-bambu-dark-tertiary" />

          {/* Fan Controls Grid */}
          <div className="grid grid-cols-2 gap-3">
            {/* Part Fan - always has speed control */}
            <FanCard
              name="Part"
              icon={<FanIcon />}
              speed={partFanSpeed}
              enabled={partFanEnabled}
              onToggle={handlePartFanToggle}
              onSpeedChange={handlePartFanSpeed}
              disabled={isDisabled}
              showSpeedControl={true}
            />

            {/* Aux Fan */}
            <FanCard
              name="Aux"
              icon={<FanIcon />}
              speed={auxFanSpeed}
              enabled={auxFanEnabled}
              onToggle={handleAuxFanToggle}
              onSpeedChange={handleAuxFanSpeed}
              disabled={isDisabled}
              showSpeedControl={mode === 'cooling'}
            />

            {/* Exhaust Fan */}
            <FanCard
              name="Exhaust"
              icon={<FanIcon />}
              speed={exhaustFanSpeed}
              enabled={exhaustFanEnabled}
              onToggle={handleExhaustFanToggle}
              onSpeedChange={handleExhaustFanSpeed}
              disabled={isDisabled}
              showSpeedControl={mode === 'cooling'}
            />

            {/* Heat Status */}
            <div className="bg-bambu-dark rounded-xl p-4 shadow-lg border border-bambu-dark-tertiary/50">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="w-8 h-8 rounded-lg bg-bambu-dark-tertiary flex items-center justify-center">
                  <HeatIcon />
                </div>
                <span className="text-white font-medium">Heat</span>
              </div>
              <div className="p-3 text-center">
                <span className="text-xl font-semibold text-bambu-green">
                  {mode === 'heating' ? 'Auto' : 'Off'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
