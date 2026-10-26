export interface Account { id: string; name: string; email: string }
export interface School {
  name: string; domain: string; email: string; role: string; workspaceName: string;
  budget: number; sampleData: boolean; verified: boolean;
}
export interface Session { user: Account | null; school: School | null }
export interface WorkspaceSession { user: Account; school: School }

export async function accountRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  let data
  try { data = await response.json() } catch { throw new Error('We could not reach your workspace. Please try again.') }
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')
  return data as T
}
