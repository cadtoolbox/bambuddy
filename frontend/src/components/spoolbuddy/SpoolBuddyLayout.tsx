import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { SpoolBuddyTopBar } from './SpoolBuddyTopBar';
import { SpoolBuddyBottomNav } from './SpoolBuddyBottomNav';
import { useSpoolBuddyState } from '../../hooks/useSpoolBuddyState';

export function SpoolBuddyLayout() {
  const [selectedPrinterId, setSelectedPrinterId] = useState<number | null>(null);
  const sbState = useSpoolBuddyState();

  // Force dark theme on mount, restore on unmount
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) root.classList.remove('dark');
    };
  }, []);

  return (
    <div className="w-screen h-screen bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      <SpoolBuddyTopBar
        selectedPrinterId={selectedPrinterId}
        onPrinterChange={setSelectedPrinterId}
        deviceOnline={sbState.deviceOnline}
      />

      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ selectedPrinterId, setSelectedPrinterId, sbState }} />
      </main>

      <SpoolBuddyBottomNav />
    </div>
  );
}

// Hook for child pages to access shared context
export interface SpoolBuddyOutletContext {
  selectedPrinterId: number | null;
  setSelectedPrinterId: (id: number) => void;
  sbState: ReturnType<typeof useSpoolBuddyState>;
}
