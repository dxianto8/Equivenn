export interface Account { id: string; name: string; email: string }
export interface School {
  name: string; domain: string; email: string; role: string; workspaceName: string;
  budget: number; sampleData: boolean; verified: boolean;
}
export interface Session { user: Account | null; school: School | null }
export interface WorkspaceSession { user: Account; school: School }

export class AccountServiceError extends Error {
  constructor(message: string, public readonly code: string) { super(message); this.name = 'AccountServiceError' }
}

export async function accountRequest<T>(path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) })
  } catch { throw new AccountServiceError('Sign-in is temporarily unavailable. Please try again.', 'CONNECTION_FAILED') }
  if (!response.headers.get('content-type')?.includes('application/json')) throw new AccountServiceError('Sign-in is not available on this deployment yet. Please contact the workspace administrator.', 'API_NOT_DEPLOYED')
  let data
  try { data = await response.json() } catch { throw new AccountServiceError('Sign-in is temporarily unavailable. Please try again.', 'INVALID_RESPONSE') }
  if (!data || typeof data !== 'object') throw new AccountServiceError('Sign-in is temporarily unavailable. Please try again.', 'INVALID_RESPONSE')
  if (!response.ok) throw new AccountServiceError(data.error || 'Something went wrong. Please try again.', data.code || 'REQUEST_FAILED')
  return data as T
}
