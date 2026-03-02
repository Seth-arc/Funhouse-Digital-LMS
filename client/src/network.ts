import axios, { AxiosRequestConfig, AxiosResponse, RawAxiosRequestHeaders } from 'axios';

const OFFLINE_QUEUE_KEY = 'fd_offline_post_queue_v1';
const OFFLINE_QUEUE_EVENT = 'fd-offline-queue-changed';
const QUEUEABLE_ENDPOINT_PATTERNS = [
  /\/api\/feedback$/,
  /\/api\/progress$/,
];

export type PostAuthMode = 'default' | 'staff' | 'learner' | 'none';

interface QueueablePostEntry {
  id: string;
  url: string;
  payload: unknown;
  headers: Record<string, string>;
  authMode: PostAuthMode;
  createdAt: string;
}

interface QueueAwarePostOptions extends AxiosRequestConfig {
  authMode?: PostAuthMode;
}

interface PostResult<T = any> {
  queued: boolean;
  response?: AxiosResponse<T>;
}

let flushing = false;

const isBrowser = typeof window !== 'undefined';

const isQueueableEndpoint = (url: string): boolean =>
  QUEUEABLE_ENDPOINT_PATTERNS.some((pattern) => pattern.test(url));

const readQueue = (): QueueablePostEntry[] => {
  if (!isBrowser) return [];
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const sanitized = parsed.filter((entry): entry is QueueablePostEntry => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<QueueablePostEntry>;
      return typeof candidate.url === 'string' && isQueueableEndpoint(candidate.url);
    });

    if (sanitized.length !== parsed.length) {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(sanitized));
    }

    return sanitized;
  } catch {
    return [];
  }
};

const writeQueue = (queue: QueueablePostEntry[]) => {
  if (!isBrowser) return;
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  window.dispatchEvent(
    new CustomEvent(OFFLINE_QUEUE_EVENT, {
      detail: { count: queue.length },
    })
  );
};

const normalizeHeaders = (headers: AxiosRequestConfig['headers']): Record<string, string> => {
  if (!headers) return {};
  const result: Record<string, string> = {};
  Object.entries(headers as Record<string, string | number | boolean | undefined>).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    result[key] = String(value);
  });
  return result;
};

const getAuthHeaderForMode = (authMode: PostAuthMode): string | null => {
  if (!isBrowser) return null;
  if (authMode === 'staff') {
    const token = localStorage.getItem('token');
    return token ? `Bearer ${token}` : null;
  }
  if (authMode === 'learner') {
    const learnerToken = localStorage.getItem('learner_token');
    return learnerToken ? `Bearer ${learnerToken}` : null;
  }
  return null;
};

const buildAxiosConfig = (entryOrOptions: { headers?: Record<string, string>; authMode?: PostAuthMode }): AxiosRequestConfig => {
  const authMode = entryOrOptions.authMode || 'default';
  const headers: RawAxiosRequestHeaders = { ...(entryOrOptions.headers || {}) };

  if (authMode === 'none') {
    delete headers.Authorization;
  } else {
    const authHeader = getAuthHeaderForMode(authMode);
    if (authHeader) {
      headers.Authorization = authHeader;
    }
  }

  return { headers };
};

const queueEntry = (entry: QueueablePostEntry) => {
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
};

const isNetworkFailure = (error: unknown): boolean =>
  axios.isAxiosError(error) && (!error.response || error.code === 'ERR_NETWORK');

export const getOfflineQueueSize = (): number => readQueue().length;

export const onOfflineQueueChange = (callback: (count: number) => void): (() => void) => {
  if (!isBrowser) return () => undefined;
  const handler = (event: Event) => {
    const custom = event as CustomEvent<{ count?: number }>;
    callback(custom.detail?.count ?? getOfflineQueueSize());
  };
  window.addEventListener(OFFLINE_QUEUE_EVENT, handler);
  return () => window.removeEventListener(OFFLINE_QUEUE_EVENT, handler);
};

export const flushOfflineQueue = async (): Promise<void> => {
  if (!isBrowser || flushing || !navigator.onLine) return;
  flushing = true;

  try {
    const queue = readQueue();
    const remaining: QueueablePostEntry[] = [];

    for (let i = 0; i < queue.length; i += 1) {
      const entry = queue[i];
      try {
        await axios.post(entry.url, entry.payload, buildAxiosConfig(entry));
      } catch (error) {
        if (isNetworkFailure(error)) {
          remaining.push(...queue.slice(i));
          break;
        }
        // Drop hard failures (4xx/5xx) so queue can continue draining.
      }
    }

    writeQueue(remaining);
  } finally {
    flushing = false;
  }
};

export const postWithOfflineQueue = async <T = any>(
  url: string,
  payload: unknown,
  options: QueueAwarePostOptions = {}
): Promise<PostResult<T>> => {
  const authMode = options.authMode || 'default';
  const headers = normalizeHeaders(options.headers);
  const requestConfig: AxiosRequestConfig = {
    ...options,
    ...buildAxiosConfig({ headers, authMode }),
  };
  delete (requestConfig as QueueAwarePostOptions).authMode;

  const queueable = isQueueableEndpoint(url);
  if (!queueable) {
    const response = await axios.post<T>(url, payload, requestConfig);
    return { queued: false, response };
  }

  const entry: QueueablePostEntry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    url,
    payload,
    headers,
    authMode,
    createdAt: new Date().toISOString(),
  };

  if (isBrowser && !navigator.onLine) {
    queueEntry(entry);
    return { queued: true };
  }

  try {
    const response = await axios.post<T>(url, payload, requestConfig);
    return { queued: false, response };
  } catch (error) {
    if (queueable && isNetworkFailure(error)) {
      queueEntry(entry);
      return { queued: true };
    }
    throw error;
  }
};
