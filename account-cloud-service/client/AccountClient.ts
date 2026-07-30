import { createAuthClient } from 'better-auth/client';
import type { SaveData } from '../../src/save/SaveData';
import type { SaveSlotId } from '../../src/save/SaveService';
import type {
  AccountSession,
  CloudSaveConflict,
  CloudSaveDecision,
  CloudSaveDownload,
  CloudSaveMetadata,
} from './CloudSaveTypes';

const SERVER_URL_STORAGE_KEY = 'emberveil.account-server-url.v1';

function defaultServerUrl(): string {
  const configured = import.meta.env.VITE_ACCOUNT_SERVER_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const host = window.location.hostname || 'localhost';
  return `${window.location.protocol === 'https:' ? 'https:' : 'http:'}//${host}:8082`;
}

function parseError(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; error?: unknown };
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error === 'string') return candidate.error;
  }
  return fallback;
}

export class CloudSaveRequestError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  public constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'CloudSaveRequestError';
    this.status = status;
    this.body = body;
  }
}

export class AccountClient {
  public readonly baseUrl: string;
  public readonly auth: ReturnType<typeof createAuthClient>;
  private csrfToken = '';

  public constructor(baseUrl = AccountClient.currentServerUrl()) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.auth = createAuthClient({
      baseURL: this.baseUrl,
      fetchOptions: { credentials: 'include' },
    });
  }

  public static currentServerUrl(): string {
    return localStorage.getItem(SERVER_URL_STORAGE_KEY) ?? defaultServerUrl();
  }

  public static setServerUrl(value: string): void {
    localStorage.setItem(SERVER_URL_STORAGE_KEY, value.replace(/\/$/, ''));
  }

  public async session(): Promise<AccountSession | null> {
    const response = await fetch(`${this.baseUrl}/api/account/session`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (response.status === 401) return null;
    if (!response.ok) throw await this.errorFrom(response, 'The account service is unavailable.');
    return response.json() as Promise<AccountSession>;
  }

  public async register(email: string, password: string): Promise<void> {
    const result = await this.auth.signUp.email({
      name: 'Emberveil Player',
      email,
      password,
      callbackURL: `${window.location.origin}${window.location.pathname}?account=verified`,
    });
    if (result.error) throw new Error(parseError(result.error, 'Registration failed.'));
  }

  public async signIn(email: string, password: string): Promise<void> {
    const result = await this.auth.signIn.email({ email, password, rememberMe: true });
    if (result.error) throw new Error(parseError(result.error, 'Sign-in failed.'));
    this.csrfToken = '';
  }

  public async signOut(): Promise<void> {
    const result = await this.auth.signOut();
    if (result.error) throw new Error(parseError(result.error, 'Sign-out failed.'));
    this.csrfToken = '';
  }

  public async requestPasswordReset(email: string): Promise<void> {
    const result = await this.auth.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}${window.location.pathname}?account=reset`,
    });
    if (result.error) throw new Error(parseError(result.error, 'Password reset could not be requested.'));
  }

  public async resetPassword(token: string, newPassword: string): Promise<void> {
    const result = await this.auth.resetPassword({ token, newPassword });
    if (result.error) throw new Error(parseError(result.error, 'Password reset failed.'));
  }

  public async deleteAccount(password: string): Promise<void> {
    const result = await this.auth.deleteUser({ password });
    if (result.error) throw new Error(parseError(result.error, 'Account deletion failed.'));
    this.csrfToken = '';
  }

  public async listCloudSaves(): Promise<CloudSaveMetadata[]> {
    const response = await this.fetchJson('/api/cloud-saves');
    return (response as { slots: CloudSaveMetadata[] }).slots;
  }

  public async download(slotId: SaveSlotId): Promise<CloudSaveDownload> {
    return this.fetchJson(`/api/cloud-saves/${slotId}`) as Promise<CloudSaveDownload>;
  }

  public async upload(
    slotId: SaveSlotId,
    save: SaveData,
    expectedCloudVersion: number | null,
    decision: CloudSaveDecision,
  ): Promise<CloudSaveMetadata> {
    const token = await this.getCsrfToken();
    const response = await fetch(`${this.baseUrl}/api/cloud-saves/${slotId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRF-Token': token,
      },
      body: JSON.stringify({
        expectedCloudVersion,
        decision,
        idempotencyKey: crypto.randomUUID(),
        save,
      }),
    });
    const body = await this.readBody(response);
    if (response.status === 409) throw new CloudSaveRequestError('Cloud save conflict.', 409, body as CloudSaveConflict);
    if (!response.ok) {
      if (response.status === 403) this.csrfToken = '';
      throw new CloudSaveRequestError(parseError(body, 'Cloud upload failed.'), response.status, body);
    }
    return (body as { metadata: CloudSaveMetadata }).metadata;
  }

  public async exportPersonalData(): Promise<Blob> {
    const response = await fetch(`${this.baseUrl}/api/account/export`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await this.errorFrom(response, 'Personal data export failed.');
    return response.blob();
  }

  private async getCsrfToken(): Promise<string> {
    if (this.csrfToken) return this.csrfToken;
    const response = await this.fetchJson('/api/csrf');
    this.csrfToken = (response as { token: string }).token;
    return this.csrfToken;
  }

  private async fetchJson(path: string): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw await this.errorFrom(response, 'Account request failed.');
    return response.json();
  }

  private async errorFrom(response: Response, fallback: string): Promise<CloudSaveRequestError> {
    const body = await this.readBody(response);
    return new CloudSaveRequestError(parseError(body, fallback), response.status, body);
  }

  private async readBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { error: text };
    }
  }
}
