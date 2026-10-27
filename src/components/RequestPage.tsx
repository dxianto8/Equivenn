import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, CheckCheck, ClipboardList, GraduationCap, LoaderCircle, ShieldCheck } from 'lucide-react'
import { accountRequest } from '../lib/account'
import Logo from './Logo'
import FundingFields from './FundingFields'
import './request-page.css'

interface FormDetails { schoolName: string; workspaceName: string }

export default function RequestPage() {
  const workspace = new URLSearchParams(window.location.search).get('workspace') || ''
  const [details, setDetails] = useState<FormDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reference, setReference] = useState('')
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID())
  const reduced = useReducedMotion()
  const load = async () => {
    setLoading(true); setError('')
    try { setDetails(await accountRequest<FormDetails>(`/request-form?workspace=${encodeURIComponent(workspace)}`)) }
    catch (error) { setError(error instanceof Error ? error.message : 'The request form could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [workspace]) // The link identifies the destination workspace.
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const fields = new FormData(event.currentTarget)
    const body = Object.fromEntries(fields)
    try {
      const result = await accountRequest<{ reference: string }>('/request-form', { ...body, workspace, id: submissionId,
        requested: Number(fields.get('requested')), members: Number(fields.get('members')), impact: Number(fields.get('impact')), utilization: Number(fields.get('utilization')) })
      setReference(result.reference)
    } catch (error) { setError(error instanceof Error ? error.message : 'Your request could not be sent. Your entries are still here; please try again.') }
    finally { setBusy(false) }
  }
  return <div className="request-page"><header className="request-page-header"><a href="/" aria-label="Equivenn home"><Logo /></a><span><ShieldCheck size={15} /> A fair chance for every idea.</span><a className="text-button" href="/">Admin sign in <ArrowRight size={14} /></a></header>
    <main className="request-page-main"><motion.aside className="request-story" initial={reduced ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><div className="eyebrow">GOOD IDEAS DESERVE A CHANCE</div><h1>A little funding.<br /><em>A bigger possibility.</em></h1><p>Tell your council what your organization can make possible. Every request starts with the same questions.</p>{details && <div className="request-destination"><GraduationCap size={24} /><div><strong>{details.schoolName}</strong><span>{details.workspaceName}</span></div></div>}<ol className="request-process"><li><span>01</span><div><strong>Share your idea.</strong><p>A few details about your organization and plans.</p></div></li><li><span>02</span><div><strong>Give it some context.</strong><p>The same metrics help your council compare requests.</p></div></li><li><span>03</span><div><strong>Let your council review.</strong><p>Your request goes straight to their funding inbox.</p></div></li></ol><div className="request-privacy"><ShieldCheck size={18} /><p>Your contact details and submission are visible to this workspace’s administrator. Submitting does not guarantee funding.</p></div></motion.aside>
    <section className="request-form-card" aria-label="Funding application">{loading ? <div className="request-result"><LoaderCircle className="spin" size={28} /><h2>Getting your form ready…</h2></div> : !details ? <div className="request-result"><ClipboardList size={30} /><h2>We couldn’t open this form.</h2><p role="alert">{error}</p><button className="button primary" onClick={() => void load()}>Try again</button><p>Use the request link shared by your council.</p></div> : reference ? <div className="request-result" role="status"><div className="request-success-icon"><CheckCheck size={32} /></div><div className="eyebrow">IDEA RECEIVED</div><h2>Your request is in.</h2><p>It’s now in {details.workspaceName}’s review inbox. Your council will review the details before including it in an allocation.</p><div className="request-receipt"><span>Submission reference</span><strong>{reference}</strong><small>Status: In review</small></div><button className="button" onClick={() => { setReference(''); setSubmissionId(crypto.randomUUID()); setError('') }}>Submit another request <ArrowRight size={15} /></button></div> : <><div className="request-form-heading"><span className="request-form-icon"><ClipboardList size={23} /></span><div><div className="eyebrow">YOUR ORGANIZATION. YOUR OPPORTUNITY.</div><h2>Request funding</h2><p>All fields are required. No account needed.</p></div></div><form onSubmit={submit}><fieldset disabled={busy}><FundingFields contact /><p className="form-help">New organization? Ask your council which starting utilization score to use. Scores are self-reported and reviewed before approval.</p></fieldset>{error && <div className="auth-error" role="alert">{error}</div>}<button className="button primary request-send" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Sending your request…</> : <>Send funding request <ArrowRight size={17} /></>}</button><p className="request-form-footnote"><ShieldCheck size={13} /> Sent directly to {details.workspaceName}. No other applicants can see your request.</p></form></>}</section></main><footer className="request-page-footer"><Logo small /><span>Transparency from the very first step.</span></footer></div>
}
