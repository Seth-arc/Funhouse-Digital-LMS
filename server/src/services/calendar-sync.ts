import { all, get, getDb, run } from '../database';
import { v4 as uuidv4 } from 'uuid';

export type CalendarProvider = 'google' | 'microsoft';
type SyncMode = 'upsert' | 'delete';

interface CalendarIntegrationRow {
  tutor_id: string;
  provider: CalendarProvider;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface CalendarSyncSessionRow {
  id: string;
  student_id: string;
  lesson_id: string | null;
  title: string | null;
  session_date: string;
  start_time: string;
  end_time: string | null;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes: string | null;
  student_name: string | null;
  student_grade: number | null;
  lesson_title: string | null;
}

interface CalendarSessionEventMappingRow {
  id: string;
  tutor_id: string;
  provider: CalendarProvider;
  session_id: string;
  external_event_id: string;
}

interface SyncWarning {
  provider: CalendarProvider;
  message: string;
}

interface ProviderOAuthConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint: string;
  scopes: string[];
}

interface OAuthTokenRefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

const DEFAULT_CALENDAR_TIMEZONE = process.env.CALENDAR_TIMEZONE?.trim() || 'UTC';

const normalizeTime = (value: string | null | undefined, fallback = '09:00'): string => {
  const raw = (value || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return fallback;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return fallback;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const addMinutesToTime = (timeHHMM: string, minutesToAdd: number): string => {
  const [hoursRaw, minutesRaw] = timeHHMM.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return '10:00';
  const total = ((hours * 60) + minutes + minutesToAdd + 24 * 60) % (24 * 60);
  const nextHours = Math.floor(total / 60);
  const nextMinutes = total % 60;
  return `${String(nextHours).padStart(2, '0')}:${String(nextMinutes).padStart(2, '0')}`;
};

const buildSessionDateTime = (dateISO: string, timeHHMM: string) => `${dateISO}T${timeHHMM}:00`;

const resolveProviderConfig = (provider: CalendarProvider): ProviderOAuthConfig | null => {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'],
    };
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() || '';
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() || 'common';
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    tokenEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    scopes: ['offline_access', 'User.Read', 'Calendars.ReadWrite'],
  };
};

const trimErrorMessage = (rawMessage: string | undefined, fallback: string): string => {
  const cleaned = (rawMessage || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return fallback;
  return cleaned.slice(0, 160);
};

const refreshAccessToken = async (
  integration: CalendarIntegrationRow
): Promise<{ accessToken: string; refreshToken: string | null; tokenExpiresAt: string | null }> => {
  if (!integration.refresh_token) {
    throw new Error('Refresh token missing for integration');
  }

  const config = resolveProviderConfig(integration.provider);
  if (!config) {
    throw new Error(`${integration.provider} oauth is not configured on server`);
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: integration.refresh_token,
    grant_type: 'refresh_token',
  });
  if (integration.provider === 'microsoft') {
    body.set('scope', config.scopes.join(' '));
  }

  const response = await fetch(config.tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !payload?.access_token) {
    const providerError =
      typeof payload?.error_description === 'string'
        ? payload.error_description
        : typeof payload?.error === 'string'
          ? payload.error
          : 'Token refresh failed';
    throw new Error(providerError);
  }

  const refreshed = payload as OAuthTokenRefreshResponse;
  const tokenExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;

  return {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || integration.refresh_token,
    tokenExpiresAt,
  };
};

const updateStoredTokens = async (
  integration: CalendarIntegrationRow,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiresAt: string | null
): Promise<void> => {
  const db = getDb();
  await run(
    db,
    `UPDATE calendar_integrations
        SET access_token = ?,
            refresh_token = ?,
            token_expires_at = ?,
            updated_at = CURRENT_TIMESTAMP
      WHERE tutor_id = ? AND provider = ?`,
    [
      accessToken,
      refreshToken,
      tokenExpiresAt,
      integration.tutor_id,
      integration.provider,
    ]
  );
};

const withProviderAuth = async (
  integration: CalendarIntegrationRow,
  execute: (accessToken: string) => Promise<Response>
): Promise<Response> => {
  let response = await execute(integration.access_token);
  if (response.status !== 401) {
    return response;
  }

  const refreshed = await refreshAccessToken(integration);
  await updateStoredTokens(
    integration,
    refreshed.accessToken,
    refreshed.refreshToken,
    refreshed.tokenExpiresAt
  );

  response = await execute(refreshed.accessToken);
  return response;
};

const buildSessionEventPayload = (session: CalendarSyncSessionRow) => {
  const sessionTitle = (session.title || '').trim();
  const lessonTitle = (session.lesson_title || '').trim();
  const learnerName = (session.student_name || '').trim() || 'Learner';
  const statusPrefix =
    session.status === 'cancelled'
      ? '[Cancelled] '
      : session.status === 'completed'
        ? '[Completed] '
        : '';
  const summary = `${statusPrefix}${sessionTitle || lessonTitle || 'Learning Session'} - ${learnerName}`;

  const startTime = normalizeTime(session.start_time, '09:00');
  const endTime = normalizeTime(
    session.end_time,
    addMinutesToTime(startTime, 60)
  );
  const startDateTime = buildSessionDateTime(session.session_date, startTime);
  const endDateTime = buildSessionDateTime(session.session_date, endTime);

  const descriptionParts = [
    `Learner: ${learnerName}`,
    session.student_grade ? `Grade: ${session.student_grade}` : '',
    lessonTitle ? `Lesson: ${lessonTitle}` : '',
    `Status: ${session.status}`,
    session.notes ? `Notes: ${session.notes}` : '',
  ].filter(Boolean);

  return {
    summary,
    description: descriptionParts.join('\n'),
    timezone: DEFAULT_CALENDAR_TIMEZONE,
    startDateTime,
    endDateTime,
  };
};

const upsertGoogleEvent = async (
  integration: CalendarIntegrationRow,
  session: CalendarSyncSessionRow,
  existingEventId: string | null
): Promise<string> => {
  const payload = buildSessionEventPayload(session);
  const body = {
    summary: payload.summary,
    description: payload.description,
    start: {
      dateTime: `${payload.startDateTime}Z`,
      timeZone: payload.timezone,
    },
    end: {
      dateTime: `${payload.endDateTime}Z`,
      timeZone: payload.timezone,
    },
  };

  const method = existingEventId ? 'PATCH' : 'POST';
  const endpoint = existingEventId
    ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(existingEventId)}`
    : 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

  const response = await withProviderAuth(integration, (accessToken) =>
    fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  );
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok || !result?.id) {
    const providerError =
      typeof result?.error?.message === 'string'
        ? result.error.message
        : 'Failed to upsert Google calendar event';
    throw new Error(providerError);
  }
  return String(result.id);
};

const deleteGoogleEvent = async (
  integration: CalendarIntegrationRow,
  eventId: string
): Promise<void> => {
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`;
  const response = await withProviderAuth(integration, (accessToken) =>
    fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  );
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`Google event delete failed (${response.status})`);
  }
};

const upsertMicrosoftEvent = async (
  integration: CalendarIntegrationRow,
  session: CalendarSyncSessionRow,
  existingEventId: string | null
): Promise<string> => {
  const payload = buildSessionEventPayload(session);
  const body = {
    subject: payload.summary,
    body: {
      contentType: 'Text',
      content: payload.description,
    },
    start: {
      dateTime: payload.startDateTime,
      timeZone: payload.timezone,
    },
    end: {
      dateTime: payload.endDateTime,
      timeZone: payload.timezone,
    },
  };

  const method = existingEventId ? 'PATCH' : 'POST';
  const endpoint = existingEventId
    ? `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(existingEventId)}`
    : 'https://graph.microsoft.com/v1.0/me/events';

  const response = await withProviderAuth(integration, (accessToken) =>
    fetch(endpoint, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
  );
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) {
    const providerError =
      typeof result?.error?.message === 'string'
        ? result.error.message
        : 'Failed to upsert Microsoft calendar event';
    throw new Error(providerError);
  }
  const eventId = existingEventId || (result?.id ? String(result.id) : '');
  if (!eventId) {
    throw new Error('Microsoft calendar event ID missing in response');
  }
  return eventId;
};

const deleteMicrosoftEvent = async (
  integration: CalendarIntegrationRow,
  eventId: string
): Promise<void> => {
  const endpoint = `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`;
  const response = await withProviderAuth(integration, (accessToken) =>
    fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
  );
  if (response.status === 404) return;
  if (!response.ok) {
    throw new Error(`Microsoft event delete failed (${response.status})`);
  }
};

const upsertProviderEvent = async (
  integration: CalendarIntegrationRow,
  session: CalendarSyncSessionRow,
  existingEventId: string | null
): Promise<string> => {
  if (integration.provider === 'google') {
    return upsertGoogleEvent(integration, session, existingEventId);
  }
  return upsertMicrosoftEvent(integration, session, existingEventId);
};

const deleteProviderEvent = async (
  integration: CalendarIntegrationRow,
  eventId: string
): Promise<void> => {
  if (integration.provider === 'google') {
    await deleteGoogleEvent(integration, eventId);
    return;
  }
  await deleteMicrosoftEvent(integration, eventId);
};

const getSessionWithDetails = async (sessionId: string): Promise<CalendarSyncSessionRow | null> => {
  const db = getDb();
  const row = await get(
    db,
    `SELECT se.id,
            se.student_id,
            se.lesson_id,
            se.title,
            se.session_date,
            se.start_time,
            se.end_time,
            se.status,
            se.notes,
            st.name AS student_name,
            st.grade AS student_grade,
            l.title AS lesson_title
       FROM sessions se
       LEFT JOIN students st ON st.id = se.student_id
       LEFT JOIN lessons l ON l.id = se.lesson_id
      WHERE se.id = ?`,
    [sessionId]
  ) as CalendarSyncSessionRow | undefined;
  return row || null;
};

const loadTutorIntegrations = async (tutorId: string): Promise<CalendarIntegrationRow[]> => {
  const db = getDb();
  const rows = await all(
    db,
    `SELECT tutor_id, provider, access_token, refresh_token, token_expires_at
       FROM calendar_integrations
      WHERE tutor_id = ?`,
    [tutorId]
  ) as CalendarIntegrationRow[];
  return rows.filter(row => row.provider === 'google' || row.provider === 'microsoft');
};

const loadEventMappingsForSession = async (
  tutorId: string,
  sessionId: string
): Promise<CalendarSessionEventMappingRow[]> => {
  const db = getDb();
  return await all(
    db,
    `SELECT id, tutor_id, provider, session_id, external_event_id
       FROM calendar_session_events
      WHERE tutor_id = ? AND session_id = ?`,
    [tutorId, sessionId]
  ) as CalendarSessionEventMappingRow[];
};

const saveEventMapping = async (
  tutorId: string,
  provider: CalendarProvider,
  sessionId: string,
  externalEventId: string
): Promise<void> => {
  const db = getDb();
  await run(
    db,
    `INSERT INTO calendar_session_events (id, tutor_id, provider, session_id, external_event_id)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(tutor_id, provider, session_id) DO UPDATE SET
       external_event_id = excluded.external_event_id,
       updated_at = CURRENT_TIMESTAMP`,
    [uuidv4(), tutorId, provider, sessionId, externalEventId]
  );
};

const deleteEventMappingsForSession = async (tutorId: string, sessionId: string): Promise<void> => {
  const db = getDb();
  await run(
    db,
    'DELETE FROM calendar_session_events WHERE tutor_id = ? AND session_id = ?',
    [tutorId, sessionId]
  );
};

const syncSessionUpsert = async (tutorId: string, sessionId: string): Promise<SyncWarning[]> => {
  const session = await getSessionWithDetails(sessionId);
  if (!session) return [];

  const integrations = await loadTutorIntegrations(tutorId);
  if (integrations.length === 0) return [];

  const mappingRows = await loadEventMappingsForSession(tutorId, sessionId);
  const mappingByProvider = new Map(mappingRows.map(row => [row.provider, row.external_event_id]));
  const warnings: SyncWarning[] = [];

  for (const integration of integrations) {
    try {
      const nextEventId = await upsertProviderEvent(
        integration,
        session,
        mappingByProvider.get(integration.provider) || null
      );
      await saveEventMapping(tutorId, integration.provider, sessionId, nextEventId);
    } catch (error: any) {
      warnings.push({
        provider: integration.provider,
        message: trimErrorMessage(error?.message, 'Calendar sync failed'),
      });
    }
  }

  return warnings;
};

const syncSessionDelete = async (tutorId: string, sessionId: string): Promise<SyncWarning[]> => {
  const mappings = await loadEventMappingsForSession(tutorId, sessionId);
  if (mappings.length === 0) return [];

  const integrations = await loadTutorIntegrations(tutorId);
  const integrationByProvider = new Map(integrations.map(item => [item.provider, item]));
  const warnings: SyncWarning[] = [];

  for (const mapping of mappings) {
    const integration = integrationByProvider.get(mapping.provider);
    if (!integration) {
      continue;
    }
    try {
      await deleteProviderEvent(integration, mapping.external_event_id);
    } catch (error: any) {
      warnings.push({
        provider: mapping.provider,
        message: trimErrorMessage(error?.message, 'Calendar delete sync failed'),
      });
    }
  }

  await deleteEventMappingsForSession(tutorId, sessionId);
  return warnings;
};

export const syncSessionCalendars = async (
  tutorId: string,
  sessionId: string,
  mode: SyncMode
): Promise<SyncWarning[]> => {
  if (mode === 'delete') {
    return syncSessionDelete(tutorId, sessionId);
  }
  return syncSessionUpsert(tutorId, sessionId);
};
