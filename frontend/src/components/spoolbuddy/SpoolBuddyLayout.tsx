import { Outlet, useSearchParams } from 'react-router-dom';
import { SpoolBuddyNav } from './SpoolBuddyNav';
import { SpoolBuddyStatusBar } from './SpoolBuddyStatusBar';
import { useSpoolBuddyState } from '../../hooks/useSpoolBuddyState';

export function SpoolBuddyLayout() {
  const [searchParams] = useSearchParams();
  const isKiosk = searchParams.get('kiosk') === '1' || window.innerHeight <= 600;
  const state = useSpoolBuddyState();

  return (
    <div
      className="w-[1024px] h-[600px] mx-auto flex flex-col bg-bg-primary overflow-hidden"
      style={{ touchAction: 'manipulation' }}
    >
      <SpoolBuddyNav isKiosk={isKiosk} />

      <main className="flex-1 overflow-hidden">
        <Outlet context={state} />
      </main>

      <SpoolBuddyStatusBar
        weightGrams={state.weight?.weight_grams ?? null}
        stable={state.weight?.stable ?? false}
        nfcOk={state.deviceOnline}
        deviceOnline={state.deviceOnline}
      />
    </div>
  );
}
