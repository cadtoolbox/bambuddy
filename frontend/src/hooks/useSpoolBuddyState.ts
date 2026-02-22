import { useCallback, useEffect, useReducer } from 'react';

// --- Types ---

interface SpoolInfo {
  id: number;
  material: string;
  subtype: string | null;
  color_name: string | null;
  rgba: string | null;
  brand: string | null;
  label_weight: number;
  core_weight: number;
  weight_used: number;
}

interface WeightData {
  weight_grams: number;
  stable: boolean;
  raw_adc: number | null;
  device_id: string;
}

interface TagData {
  tag_uid: string;
  sak?: number;
  tag_type?: string;
  tray_uuid?: string;
  device_id: string;
}

type DashboardView = 'idle' | 'tag_known' | 'tag_unknown';

interface SpoolBuddyState {
  view: DashboardView;
  weight: WeightData | null;
  tag: TagData | null;
  spool: SpoolInfo | null;
  deviceOnline: boolean;
}

type Action =
  | { type: 'WEIGHT_UPDATE'; payload: WeightData }
  | { type: 'TAG_MATCHED'; payload: { tag: TagData; spool: SpoolInfo } }
  | { type: 'TAG_UNKNOWN'; payload: TagData }
  | { type: 'TAG_REMOVED' }
  | { type: 'DEVICE_ONLINE' }
  | { type: 'DEVICE_OFFLINE' };

// --- Reducer ---

const initialState: SpoolBuddyState = {
  view: 'idle',
  weight: null,
  tag: null,
  spool: null,
  deviceOnline: false,
};

function reducer(state: SpoolBuddyState, action: Action): SpoolBuddyState {
  switch (action.type) {
    case 'WEIGHT_UPDATE':
      return { ...state, weight: action.payload };

    case 'TAG_MATCHED':
      return {
        ...state,
        view: 'tag_known',
        tag: action.payload.tag,
        spool: action.payload.spool,
      };

    case 'TAG_UNKNOWN':
      return {
        ...state,
        view: 'tag_unknown',
        tag: action.payload,
        spool: null,
      };

    case 'TAG_REMOVED':
      return {
        ...state,
        view: 'idle',
        tag: null,
        spool: null,
      };

    case 'DEVICE_ONLINE':
      return { ...state, deviceOnline: true };

    case 'DEVICE_OFFLINE':
      return { ...state, deviceOnline: false, weight: null };

    default:
      return state;
  }
}

// --- Hook ---

export function useSpoolBuddyState() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleWeight = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    dispatch({
      type: 'WEIGHT_UPDATE',
      payload: {
        weight_grams: detail.weight_grams,
        stable: detail.stable,
        raw_adc: detail.raw_adc ?? null,
        device_id: detail.device_id,
      },
    });
  }, []);

  const handleTagMatched = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    dispatch({
      type: 'TAG_MATCHED',
      payload: {
        tag: {
          tag_uid: detail.tag_uid,
          device_id: detail.device_id,
        },
        spool: detail.spool,
      },
    });
  }, []);

  const handleTagUnknown = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    dispatch({
      type: 'TAG_UNKNOWN',
      payload: {
        tag_uid: detail.tag_uid,
        sak: detail.sak,
        tag_type: detail.tag_type,
        device_id: detail.device_id,
      },
    });
  }, []);

  const handleTagRemoved = useCallback(() => {
    dispatch({ type: 'TAG_REMOVED' });
  }, []);

  const handleDeviceStatus = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    if (detail.type === 'spoolbuddy_online') {
      dispatch({ type: 'DEVICE_ONLINE' });
    } else {
      dispatch({ type: 'DEVICE_OFFLINE' });
    }
  }, []);

  useEffect(() => {
    window.addEventListener('spoolbuddy-weight', handleWeight);
    window.addEventListener('spoolbuddy-tag-matched', handleTagMatched);
    window.addEventListener('spoolbuddy-unknown-tag', handleTagUnknown);
    window.addEventListener('spoolbuddy-tag-removed', handleTagRemoved);
    window.addEventListener('spoolbuddy-device-status', handleDeviceStatus);

    return () => {
      window.removeEventListener('spoolbuddy-weight', handleWeight);
      window.removeEventListener('spoolbuddy-tag-matched', handleTagMatched);
      window.removeEventListener('spoolbuddy-unknown-tag', handleTagUnknown);
      window.removeEventListener('spoolbuddy-tag-removed', handleTagRemoved);
      window.removeEventListener('spoolbuddy-device-status', handleDeviceStatus);
    };
  }, [handleWeight, handleTagMatched, handleTagUnknown, handleTagRemoved, handleDeviceStatus]);

  return state;
}
