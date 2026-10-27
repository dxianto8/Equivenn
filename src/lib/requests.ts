import { useCallback, useEffect, useRef, useState } from 'react'
import { accountRequest } from './account'
import type { Organization } from './allocation'

export interface RequestPortal { token: string; schoolName: string; workspaceName: string }
interface Inbox { organizations: Organization[]; portal: RequestPortal }

export function useFundingRequests() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [portal, setPortal] = useState<RequestPortal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [changing, setChanging] = useState(false)
  const sequence = useRef(0)
  const requestNumber = useRef(0)
  const lastApplied = useRef(0)
  const refresh = useCallback(async () => {
    const current = sequence.current
    const number = ++requestNumber.current
    try {
      const data = await accountRequest<Inbox>('/requests')
      // A slow cold start can exceed the polling interval. A newer pending
      // poll must not prevent a completed response from opening the inbox.
      if (current !== sequence.current || number < lastApplied.current) return
      lastApplied.current = number
      setOrganizations(previous => JSON.stringify(previous) === JSON.stringify(data.organizations) ? previous : data.organizations)
      setPortal(data.portal); setError('')
    } catch (error) {
      if (current === sequence.current && number >= lastApplied.current) {
        lastApplied.current = number
        setError(error instanceof Error ? error.message : 'Requests could not be refreshed.')
      }
    } finally { if (current === sequence.current && number >= lastApplied.current) setLoading(false) }
  }, [])
  useEffect(() => {
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    const focus = () => { void refresh() }
    window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); sequence.current++ }
  }, [refresh])
  const change = async (body: unknown) => {
    setChanging(true)
    sequence.current++
    try {
      const { organization } = await accountRequest<{ organization: Organization }>('/requests', body)
      sequence.current++
      setOrganizations(previous => [organization, ...previous.filter(row => row.id !== organization.id)].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.id.localeCompare(b.id)))
      setLoading(false); setError('')
      void refresh()
    } finally { setChanging(false) }
  }
  return { organizations, portal, loading, error, changing, refresh,
    create: (organization: Organization) => change({ ...organization, action: 'create' }),
    approve: (id: string) => change({ action: 'approve', id }) }
}

export function requestFingerprint(rows: Organization[]) {
  return JSON.stringify([...rows].sort((a, b) => a.id.localeCompare(b.id)).map(row => [row.id, row.name, row.category, row.description, row.requested, row.members, row.impact, row.utilization, row.status]))
}
