import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { SpoolBuddyOutletContext } from '../../components/spoolbuddy/SpoolBuddyLayout';
import { WeightDisplay } from '../../components/spoolbuddy/WeightDisplay';
import { SpoolInfoCard, UnknownTagCard } from '../../components/spoolbuddy/SpoolInfoCard';

// Color palette for idle animation
const SPOOL_COLORS = [
  '#00AE42', '#FF6B35', '#3B82F6', '#EF4444', '#A855F7',
  '#FBBF24', '#14B8A6', '#EC4899', '#F97316', '#22C55E',
];

function IdleState() {
  const { t } = useTranslation();
  const [colorIndex, setColorIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setColorIndex((prev) => (prev + 1) % SPOOL_COLORS.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const color = SPOOL_COLORS[colorIndex];

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      {/* Animated spool with NFC waves */}
      <div className="relative mb-6 flex items-center justify-center" style={{ width: 140, height: 140 }}>
        {/* NFC wave rings */}
        <div className="absolute w-20 h-20 rounded-full border-2 border-green-500/30 animate-ping" style={{ animationDuration: '2.5s' }} />
        <div className="absolute w-28 h-28 rounded-full border border-green-500/20 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.4s' }} />
        <div className="absolute w-36 h-36 rounded-full border border-green-500/10 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.8s' }} />

        {/* Spool circle */}
        <div className="relative">
          <div
            className="absolute -inset-4 rounded-full blur-2xl opacity-30 transition-colors duration-1000"
            style={{ backgroundColor: color }}
          />
          <svg viewBox="0 0 80 80" className="w-20 h-20 transition-all duration-1000">
            <circle cx="40" cy="40" r="38" fill={color} />
            <circle cx="40" cy="40" r="30" fill={color} style={{ filter: 'brightness(0.85)' }} />
            <ellipse cx="30" cy="30" rx="8" ry="5" fill="white" opacity="0.3" />
            <circle cx="40" cy="40" r="12" fill="#27272a" />
            <circle cx="40" cy="40" r="7" fill="#18181b" />
          </svg>
        </div>
      </div>

      <p className="text-lg text-zinc-300 mb-1">{t('spoolbuddy.dashboard.readyToScan', 'Ready to scan')}</p>
      <p className="text-sm text-zinc-500">{t('spoolbuddy.dashboard.idleMessage', 'Place a spool on the scale to identify it')}</p>
    </div>
  );
}

function DeviceOfflineState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <div className="w-20 h-20 rounded-full bg-zinc-800 flex items-center justify-center mb-6">
        <svg className="w-10 h-10 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-12.728-12.728m12.728 12.728L5.636 5.636m12.728 0a9 9 0 00-12.728 0m0 12.728a9 9 0 010-12.728" />
        </svg>
      </div>
      <p className="text-lg text-zinc-400 mb-1">{t('spoolbuddy.status.deviceOffline', 'Device Offline')}</p>
      <p className="text-sm text-zinc-600">{t('spoolbuddy.status.waitingConnection', 'Waiting for device connection...')}</p>
    </div>
  );
}

export function SpoolBuddyDashboard() {
  const { sbState } = useOutletContext<SpoolBuddyOutletContext>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  // Persist the displayed card (tag stays until user dismisses or new tag)
  const [displayedTagId, setDisplayedTagId] = useState<string | null>(null);
  const [hiddenTagId, setHiddenTagId] = useState<string | null>(null);

  // Track current tag from state
  const currentTagId = sbState.matchedSpool?.tag_uid ?? sbState.unknownTagUid ?? null;

  useEffect(() => {
    if (currentTagId) {
      const isHidden = hiddenTagId === currentTagId;
      const isDifferent = displayedTagId !== null && displayedTagId !== currentTagId;

      if (isDifferent || (!isHidden && displayedTagId !== currentTagId)) {
        setDisplayedTagId(currentTagId);
        setHiddenTagId(null);
      }
    } else {
      if (hiddenTagId) {
        setDisplayedTagId(null);
        setHiddenTagId(null);
      }
    }
  }, [currentTagId, displayedTagId, hiddenTagId]);

  const handleClose = () => {
    setHiddenTagId(displayedTagId);
  };

  const handleLinkSpool = () => {
    navigate('/spoolbuddy/inventory');
  };

  const showCard = displayedTagId && hiddenTagId !== displayedTagId;
  const isMatchedSpool = sbState.matchedSpool && displayedTagId === sbState.matchedSpool.tag_uid;

  // If device offline
  if (!sbState.deviceOnline) {
    return (
      <div className="h-full flex flex-col">
        <DeviceOfflineState />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-4">
      <h1 className="text-lg font-semibold text-zinc-100 mb-4">
        {t('spoolbuddy.nav.dashboard', 'Dashboard')}
      </h1>

      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left column: Weight + status */}
        <div className="w-[40%] flex flex-col items-center justify-center gap-4">
          <WeightDisplay
            weight={sbState.weight}
            weightStable={sbState.weightStable}
            deviceOnline={sbState.deviceOnline}
            deviceId={sbState.deviceId}
          />

          {/* NFC status */}
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${sbState.deviceOnline ? 'bg-green-500' : 'bg-zinc-600'}`} />
            <span className="text-zinc-400">
              {sbState.deviceOnline
                ? t('spoolbuddy.status.nfcReady', 'NFC Ready')
                : t('spoolbuddy.status.nfcOff', 'NFC Off')}
            </span>
          </div>
        </div>

        {/* Right column: Spool card or idle */}
        <div className="w-[60%] flex flex-col justify-center">
          {showCard && isMatchedSpool && sbState.matchedSpool ? (
            <SpoolInfoCard
              spool={sbState.matchedSpool}
              scaleWeight={sbState.weight}
              weightStable={sbState.weightStable}
              onClose={handleClose}
            />
          ) : showCard && sbState.unknownTagUid ? (
            <UnknownTagCard
              tagUid={sbState.unknownTagUid}
              onLinkSpool={handleLinkSpool}
              onClose={handleClose}
            />
          ) : (
            <IdleState />
          )}
        </div>
      </div>
    </div>
  );
}
