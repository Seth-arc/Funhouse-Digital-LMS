import express, { Request } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { all, get, getDb, run } from '../database';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { getFrontendAppUrl } from '../config';

const router = express.Router();

type CalendarProvider = 'google' | 'microsoft';

interface ProviderOAuthConfig {
  clientId: string;
  clientSecret: string;
  authEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  redirectUri: string;
  extraAuthParams?: Record<string, string>;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

const isCalendarProvider = (value: string): value is CalendarProvider =>
  value === 'google' || value === 'microsoft';

const resolveRequestBaseUrl = (req: Request): string => {
  const forwardedHost = req.get('x-forwarded-host');
  const host = forwardedHost || req.get('host');
  const forwardedProto = req.get('x-forwarded-proto');
  const protocol = forwardedProto?.split(',')[0]?.trim() || req.protocol || 'http';
  return `${protocol}://${host}`;
};

const sanitizeRedirectMessage = (rawValue: string | null | undefined): string | undefined => {
  if (!rawValue) return undefined;
  const compact = rawValue.replace(/[^a-zA-Z0-9_\-. ]+/g, ' ').trim().slice(0, 80);
  return compact || undefined;
};

const createFrontendRedirect = (
  provider: CalendarProvider,
  status: 'connected' | 'error',
  message?: string
): string => {
  const frontendBaseUrl = getFrontendAppUrl().replace(/\/+$/, '');
  const params = new URLSearchParams({
    calendarProvider: provider,
    calendarStatus: status,
  });
  const safeMessage = sanitizeRedirectMessage(message);
  if (safeMessage) {
    params.set('calendarMessage', safeMessage);
  }
  return `${frontendBaseUrl}/tutor?${params.toString()}`;
};

const resolveProviderConfig = (provider: CalendarProvider, redirectUri: string): ProviderOAuthConfig | null => {
  if (provider === 'google') {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/calendar.events'],
      redirectUri,
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    };
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() || '';
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() || 'common';
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    authEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`,
    tokenEndpoint: `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    scopes: ['offline_access', 'User.Read', 'Calendars.ReadWrite'],
    redirectUri,
  };
};

const isProviderConfigured = (provider: CalendarProvider): boolean => {
  if (provider === 'google') {
    return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
  }
  return Boolean(process.env.MICROSOFT_CLIENT_ID?.trim() && process.env.MICROSOFT_CLIENT_SECRET?.trim());
};

const exchangeAuthorizationCode = async (config: ProviderOAuthConfig, code: string): Promise<OAuthTokenResponse> => {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code',
  });

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
          : 'Token exchange failed';
    throw new Error(providerError);
  }

  return payload as OAuthTokenResponse;
};

const fetchExternalEmail = async (provider: CalendarProvider, accessToken: string): Promise<string | null> => {
  if (provider === 'google') {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const payload = await response.json().catch(() => null) as Record<string, any> | null;
    if (!response.ok) return null;
    const email = typeof payload?.email === 'string' ? payload.email.trim() : '';
    return email || null;
  }

  const response = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) return null;
  const email =
    (typeof payload?.mail === 'string' && payload.mail.trim()) ||
    (typeof payload?.userPrincipalName === 'string' && payload.userPrincipalName.trim()) ||
    '';
  return email || null;
};

router.get('/', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const rows = await all(
      db,
      `SELECT provider, external_email, token_expires_at, updated_at
         FROM calendar_integrations
        WHERE tutor_id = ?`,
      [req.userId]
    ) as Array<{
      provider: CalendarProvider;
      external_email: string | null;
      token_expires_at: string | null;
      updated_at: string | null;
    }>;

    const rowMap = new Map(rows.map(row => [row.provider, row]));
    const providers: CalendarProvider[] = ['google', 'microsoft'];
    res.json({
      providers: providers.map((provider) => {
        const row = rowMap.get(provider);
        return {
          provider,
          configured: isProviderConfigured(provider),
          linked: Boolean(row),
          external_email: row?.external_email || null,
          token_expires_at: row?.token_expires_at || null,
          updated_at: row?.updated_at || null,
        };
      }),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to load calendar integrations' });
  }
});

router.post('/:provider/connect', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    if (!isCalendarProvider(req.params.provider)) {
      return res.status(404).json({ error: 'Unknown calendar provider' });
    }
    const provider = req.params.provider;
    const db = getDb();

    await run(
      db,
      'DELETE FROM calendar_oauth_states WHERE expires_at < ?',
      [new Date().toISOString()]
    );

    const redirectUri = `${resolveRequestBaseUrl(req)}/api/calendar-integrations/${provider}/callback`;
    const config = resolveProviderConfig(provider, redirectUri);
    if (!config) {
      return res.status(400).json({ error: `${provider} calendar is not configured on the server` });
    }

    const stateToken = crypto.randomBytes(24).toString('hex');
    const stateId = uuidv4();
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS).toISOString();
    await run(
      db,
      `INSERT INTO calendar_oauth_states (id, state_token, tutor_id, provider, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
      [stateId, stateToken, req.userId, provider, expiresAt]
    );

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: config.scopes.join(' '),
      state: stateToken,
    });
    Object.entries(config.extraAuthParams || {}).forEach(([key, value]) => {
      params.set(key, value);
    });

    res.json({
      provider,
      auth_url: `${config.authEndpoint}?${params.toString()}`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to start calendar connection' });
  }
});

router.get('/:provider/callback', async (req, res) => {
  const providerParam = req.params.provider;
  if (!isCalendarProvider(providerParam)) {
    res.redirect(`${getFrontendAppUrl().replace(/\/+$/, '')}/tutor?calendarStatus=error&calendarMessage=unknown_provider`);
    return;
  }
  const provider = providerParam;

  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
  const oauthErrorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : '';
  if (oauthError) {
    res.redirect(createFrontendRedirect(provider, 'error', oauthErrorDescription || oauthError));
    return;
  }

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) {
    res.redirect(createFrontendRedirect(provider, 'error', 'Missing oauth code or state'));
    return;
  }

  const db = getDb();
  try {
    const stateRow = await get(
      db,
      `SELECT id, tutor_id, provider, expires_at
         FROM calendar_oauth_states
        WHERE state_token = ?`,
      [state]
    ) as { id: string; tutor_id: string; provider: CalendarProvider; expires_at: string } | undefined;

    if (!stateRow || stateRow.provider !== provider) {
      res.redirect(createFrontendRedirect(provider, 'error', 'Invalid oauth state'));
      return;
    }

    await run(db, 'DELETE FROM calendar_oauth_states WHERE id = ?', [stateRow.id]);
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      res.redirect(createFrontendRedirect(provider, 'error', 'Oauth state expired'));
      return;
    }

    const redirectUri = `${resolveRequestBaseUrl(req)}/api/calendar-integrations/${provider}/callback`;
    const config = resolveProviderConfig(provider, redirectUri);
    if (!config) {
      res.redirect(createFrontendRedirect(provider, 'error', 'Provider is not configured'));
      return;
    }

    const tokenPayload = await exchangeAuthorizationCode(config, code);
    const externalEmail = await fetchExternalEmail(provider, tokenPayload.access_token);
    const expiresAt = tokenPayload.expires_in
      ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString()
      : null;

    await run(
      db,
      `INSERT INTO calendar_integrations (
         id, tutor_id, provider, external_email, access_token, refresh_token, token_expires_at, scope
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(tutor_id, provider) DO UPDATE SET
         external_email = excluded.external_email,
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, refresh_token),
         token_expires_at = excluded.token_expires_at,
         scope = excluded.scope,
         updated_at = CURRENT_TIMESTAMP`,
      [
        uuidv4(),
        stateRow.tutor_id,
        provider,
        externalEmail,
        tokenPayload.access_token,
        tokenPayload.refresh_token || null,
        expiresAt,
        tokenPayload.scope || config.scopes.join(' '),
      ]
    );

    res.redirect(createFrontendRedirect(provider, 'connected'));
  } catch (error: any) {
    res.redirect(createFrontendRedirect(provider, 'error', error.message || 'Failed to complete connection'));
  }
});

router.delete('/:provider', authenticate, requireRole('tutor'), async (req: AuthRequest, res) => {
  try {
    if (!isCalendarProvider(req.params.provider)) {
      return res.status(404).json({ error: 'Unknown calendar provider' });
    }
    const provider = req.params.provider;
    const db = getDb();
    await run(
      db,
      'DELETE FROM calendar_integrations WHERE tutor_id = ? AND provider = ?',
      [req.userId, provider]
    );
    await run(
      db,
      'DELETE FROM calendar_session_events WHERE tutor_id = ? AND provider = ?',
      [req.userId, provider]
    );
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to disconnect calendar provider' });
  }
});

export default router;
