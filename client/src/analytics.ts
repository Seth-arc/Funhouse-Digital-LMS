import { postWithOfflineQueue, PostAuthMode } from './network';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

interface TrackEventOptions {
  pagePath?: string;
  role?: string;
  authMode?: PostAuthMode;
}

const inferAuthMode = (): PostAuthMode => {
  if (typeof window === 'undefined') return 'none';
  if (localStorage.getItem('token')) return 'staff';
  if (localStorage.getItem('learner_token')) return 'learner';
  return 'none';
};

export const trackEvent = async (
  eventName: string,
  properties: Record<string, unknown> = {},
  options: TrackEventOptions = {}
): Promise<void> => {
  const trimmedEventName = eventName.trim();
  if (!trimmedEventName) return;

  const pagePath = options.pagePath || (typeof window !== 'undefined' ? window.location.pathname : '');

  try {
    await postWithOfflineQueue(`${API_URL}/analytics/event`, {
      event_name: trimmedEventName,
      page_path: pagePath,
      role: options.role,
      properties,
    }, {
      authMode: options.authMode || inferAuthMode(),
    });
  } catch {
    // Analytics must never break user flows.
  }
};
