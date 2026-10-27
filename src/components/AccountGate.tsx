import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowLeft, ArrowRight, Check, CheckCheck, Eye, EyeOff, GraduationCap, HeartHandshake, Leaf, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Users } from 'lucide-react'
import Logo from './Logo'
import { accountRequest } from '../lib/account'
import type { Session, WorkspaceSession } from '../lib/account'
import './onboarding.css'

type Screen = 'signup' | 'signin' | 'school' | 'workspace'
const currency = (amount: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)

function WelcomeArtwork() {
  const reduced = useReducedMotion()
  return <div className="welcome-art" aria-hidden="true">
    <motion.div className="welcome-orbit orbit-outer" animate={reduced ? {} : { rotate: 360 }} transition={{ duration: 100, repeat: Infinity, ease: 'linear' }}><i /></motion.div>
    <motion.div className="welcome-orbit orbit-inner" animate={reduced ? {} : { rotate: -360 }} transition={{ duration: 85, repeat: Infinity, ease: 'linear' }}><i /></motion.div>
    <div className="welcome-art-glow" />
    <motion.div className="welcome-core" animate={reduced ? {} : { y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}><div className="welcome-core-inner"><Logo small /><span>SHARED POSSIBILITIES</span></div></motion.div>
    <motion.div className="floating-chip chip-school" animate={reduced ? {} : { y: [0, 7, 0], rotate: [-5, -3, -5] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}><span><GraduationCap size={21} /></span><div>Your campus<strong>Connected by purpose.</strong></div></motion.div>
    <motion.div className="floating-chip chip-impact" animate={reduced ? {} : { y: [0, -9, 0], rotate: [5, 3, 5] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}><span><HeartHandshake size={21} /></span><div>Every organization<strong>A fair opportunity.</strong></div></motion.div>
    <motion.div className="floating-leaf" animate={reduced ? {} : { rotate: [-10, 8, -10], y: [0, -6, 0] }} transition={{ duration: 8, repeat: Infinity }}><Leaf size={24} /></motion.div>
    <span className="art-dot dot-one" /><span className="art-dot dot-two" />
  </div>
}

export default function AccountGate({ children }: { children: (session: WorkspaceSession, signOut: () => Promise<void>) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState('')
  const [screen, setScreen] = useState<Screen>('signup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [schoolName, setSchoolName] = useState('')
  const [domain, setDomain] = useState('')
  const [schoolEmail, setSchoolEmail] = useState('')
  const [role, setRole] = useState('Treasurer')
  const [workspaceName, setWorkspaceName] = useState('Student Government')
  const [budget, setBudget] = useState(120000)
  const reduced = useReducedMotion()
  const load = useCallback(async () => {
    setLoading(true); setBootError('')
    try {
      const next = await accountRequest<Session>('/session')
      setSession(next)
      if (next.user && !next.school) { setScreen('school'); setSchoolEmail(next.user.email) }
    } catch (error) { setBootError(error instanceof Error ? error.message : 'Sign-in is temporarily unavailable. Please try again.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    if (!session?.user) return
    const refresh = () => { void accountRequest<Session>('/session').then(next => { setSession(next); if (!next.user) setScreen('signin') }).catch(() => { /* Keep the current view on temporary connectivity loss. */ }) }
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 5 * 60 * 1000)
    return () => { window.removeEventListener('focus', refresh); clearInterval(timer) }
  }, [session?.user?.id])
  const signOut = async () => {
    await accountRequest('/auth/logout', {})
    setSession({ user: null, school: null }); setScreen('signin'); setPassword(''); setError(''); setSchoolName(''); setDomain(''); setSchoolEmail(''); setRole('Treasurer'); setWorkspaceName('Student Government'); setBudget(120000)
  }
  const switchScreen = (next: Screen) => { setScreen(next); setError(''); setPassword(''); setShowPassword(false) }
  const accountSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const next = await accountRequest<Session>(`/auth/${screen === 'signin' ? 'login' : 'register'}`, { name: form.get('name'), email: form.get('email'), password })
      setSession(next); setPassword(''); setShowPassword(false)
      if (!next.school) { setSchoolName(''); setDomain(''); setRole('Treasurer'); setWorkspaceName('Student Government'); setBudget(120000); setSchoolEmail(next.user?.email || ''); setScreen('school') }
    } catch (error) { setError(error instanceof Error ? error.message : 'We couldn’t continue. Please try again.') }
    finally { setBusy(false) }
  }
  const schoolSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('')
    const normalizedDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    setDomain(normalizedDomain)
    const emailDomain = schoolEmail.trim().toLowerCase().split('@')[1]
    if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalizedDomain)) { setError('Enter your school’s domain, such as northbridge.edu.'); return }
    if (!(emailDomain === normalizedDomain || emailDomain?.endsWith(`.${normalizedDomain}`))) { setError(`Use a school email ending in @${normalizedDomain} (or a school subdomain).`); return }
    setScreen('workspace')
  }
  const workspaceSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    try { setSession(await accountRequest<Session>('/school', { name: schoolName, domain, email: schoolEmail, role, workspaceName, budget, sampleData: false })) }
    catch (error) { setError(error instanceof Error ? error.message : 'We couldn’t connect your workspace. Please try again.') }
    finally { setBusy(false) }
  }

  if (loading || bootError) return <div className="auth-loading"><Logo /><div className="auth-loading-mark">{bootError ? <ShieldCheck size={28} /> : <LoaderCircle className="spin" size={28} />}</div><h1>{bootError ? 'Sign-in is unavailable right now.' : 'A little clarity is on its way.'}</h1><p>{bootError || 'Getting your workspace ready…'}</p>{bootError && <button className="button primary" onClick={() => void load()}>Try again <ArrowRight size={16} /></button>}</div>
  if (session?.user && session.school) return children({ user: session.user, school: session.school }, signOut)

  const step = screen === 'school' ? 2 : screen === 'workspace' ? 3 : 1
  const strength = Number(password.length >= 10) + Number(password.length >= 14) + Number(/[a-z]/.test(password) && /[A-Z]/.test(password)) + Number(/\d|[^a-zA-Z]/.test(password))
  const firstName = session?.user?.name.split(' ')[0]
  return <div className="onboarding-shell"><aside className="welcome-panel"><div className="welcome-brand"><Logo /><span className="welcome-brand-label">A SHARED WAY FORWARD</span></div><div className="welcome-story"><motion.div initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7 }}><div className="welcome-kicker"><span /> SMALL RESOURCES. BIG POSSIBILITIES.</div><h1>A fairer future<br />starts with <em>you.</em></h1><p>Bring your community together.<br />Give every good idea a fair chance.</p></motion.div><WelcomeArtwork /><div className="welcome-principles"><div><ShieldCheck size={19} /><span>Clear decisions.</span></div><div><Users size={19} /><span>Shared opportunities.</span></div><div><Leaf size={19} /><span>Lasting impact.</span></div></div></div><div className="welcome-footer"><span>A little more transparency. A lot more trust.</span><i>Est. for everyone.</i></div></aside>
    <div className="onboarding-content"><header className="onboarding-header"><div className="mobile-onboarding-brand"><Logo /></div><span>{session?.user ? <>Signed in as <strong>{session.user.name}</strong></> : screen === 'signin' ? 'New to the community?' : 'Already have an account?'}</span><button disabled={busy} onClick={() => { if (session?.user) { void signOut().catch(() => setError('We couldn’t sign you out. Please try again.')) } else switchScreen(screen === 'signin' ? 'signup' : 'signin') }}>{session?.user ? 'Sign out' : screen === 'signin' ? 'Create an account' : 'Sign in'}<ArrowUpRightIcon /></button></header>
      <div className="onboarding-form-wrap"><ol className="onboarding-steps" aria-label="Account setup progress">{['Your account', 'Your school', 'Your workspace'].map((label, i) => <li key={label} className={step > i + 1 ? 'complete' : step === i + 1 ? 'current' : ''} aria-current={step === i + 1 ? 'step' : undefined}><span>{step > i + 1 ? <Check size={12} /> : `0${i + 1}`}</span><strong>{label}</strong>{i < 2 && <i />}</li>)}</ol>
        <AnimatePresence mode="wait" initial={false}><motion.section className="onboarding-form-panel" key={screen} initial={reduced ? false : { opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -12 }} transition={{ duration: reduced ? 0 : .23 }}>
          {(screen === 'signup' || screen === 'signin') && <><div className="onboarding-step-icon"><Users size={23} strokeWidth={1.6} /></div><div className="eyebrow">{screen === 'signin' ? 'GOOD TO HAVE YOU BACK' : 'LET’S START SOMETHING FAIR'}</div><h2>{screen === 'signin' ? 'Your community is waiting.' : 'Big ideas start with you.'}</h2><p className="onboarding-intro">{screen === 'signin' ? 'Sign in to pick up where you left off.' : 'Create your account. Connect your school. Make a difference.'}</p><form onSubmit={accountSubmit} className="onboarding-form">
            {screen === 'signup' && <label className="field">Full name<input name="name" autoComplete="name" placeholder="Jamie Lewis" minLength={2} maxLength={80} required disabled={busy} /></label>}
            <label className="field">Email address<div className="auth-input-icon"><Mail size={16} /><input name="email" type="email" autoComplete="email" placeholder="you@school.edu" maxLength={254} required disabled={busy} /></div></label>
            <label className="field">Password<div className="auth-input-icon password-field"><LockKeyhole size={16} /><input name="password" type={showPassword ? 'text' : 'password'} autoComplete={screen === 'signin' ? 'current-password' : 'new-password'} placeholder={screen === 'signin' ? 'Enter your password' : 'At least 10 characters'} minLength={screen === 'signin' ? 1 : 10} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} required disabled={busy} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>
            {screen === 'signup' && <div className="password-guidance"><div className="password-strength" aria-hidden="true">{[1, 2, 3, 4].map(n => <motion.i key={n} animate={{ backgroundColor: n <= strength ? '#7f9d70' : '#e8eddf' }} />)}</div><span>{!password ? 'Make it long. Make it yours.' : password.length < 10 ? 'Keep going — at least 10 characters.' : strength >= 3 ? 'Looking strong. A good start.' : 'Try a longer phrase for extra strength.'}</span></div>}
            {error && <div className="auth-error" role="alert">{error}</div>}
            <motion.button className="button primary onboarding-submit" type="submit" disabled={busy} whileHover={reduced ? {} : { y: -2 }} whileTap={reduced ? {} : { scale: .985 }}>{busy ? <><LoaderCircle size={17} className="spin" />{screen === 'signin' ? 'Signing you in…' : 'Creating your account…'}</> : <>{screen === 'signin' ? 'Sign in to Equivenn' : 'Create my account'}<ArrowRight size={17} /></>}</motion.button>
          </form><div className="onboarding-trust"><LockKeyhole size={13} /><span>Your password is protected. Your possibilities are open.</span></div><div className="onboarding-fineprint">{screen === 'signup' ? 'You’ll connect your school and set your funding priorities next.' : 'Your school connection and workspace will be here when you return.'}</div></>}
          {screen === 'school' && <><div className="onboarding-step-icon"><GraduationCap size={24} strokeWidth={1.6} /></div><div className="eyebrow">YOUR COMMUNITY, AT THE CENTER</div><h2>Where will you make an impact?</h2><p className="onboarding-intro">Nice to meet you{firstName ? `, ${firstName}` : ''}. Let’s connect your school to your workspace.</p><form onSubmit={schoolSubmit} className="onboarding-form"><label className="field">School name<input name="schoolName" placeholder="e.g. Northbridge University" autoComplete="organization" minLength={3} maxLength={120} required value={schoolName} onChange={e => setSchoolName(e.target.value)} /></label><label className="field">School domain<input name="domain" aria-label="School domain" aria-describedby="school-domain-help" placeholder="northbridge.edu" autoCapitalize="none" autoCorrect="off" maxLength={253} required value={domain} onChange={e => setDomain(e.target.value)} /><small id="school-domain-help">Use your school’s website domain, without a page path.</small></label><label className="field">Your school email<input name="schoolEmail" aria-label="Your school email" aria-describedby="school-email-help" type="email" placeholder="you@northbridge.edu" maxLength={254} required value={schoolEmail} onChange={e => setSchoolEmail(e.target.value)} /><small id="school-email-help">This should match your school’s domain.</small></label><label className="field">Your role<select name="role" value={role} onChange={e => setRole(e.target.value)}>{['Treasurer', 'Council member', 'Organization lead', 'Administrator'].map(r => <option key={r}>{r}</option>)}</select></label>{error && <div className="auth-error" role="alert">{error}</div>}<button className="button primary onboarding-submit" type="submit">Connect my school <ArrowRight size={17} /></button></form><div className="school-disclosure"><ShieldCheck size={16} /><p>This links your school details to your workspace. School affiliation is self-reported; school sign-in and email verification are not connected.</p></div></>}
          {screen === 'workspace' && <><div className="onboarding-step-icon"><CheckCheck size={24} strokeWidth={1.6} /></div><div className="eyebrow">ONE LAST STEP. ENDLESS POSSIBILITIES.</div><h2>Make room for good ideas.</h2><p className="onboarding-intro">Set the foundation. You can fine-tune your budget and allocation model from your dashboard.</p><div className="connected-school"><div><GraduationCap size={22} /></div><span><strong>{schoolName}</strong><small>{domain} · {role}</small></span><button aria-label="Edit school details" onClick={() => switchScreen('school')}>Edit</button></div><form onSubmit={workspaceSubmit} className="onboarding-form"><label className="field">Workspace name<input name="workspaceName" placeholder="Student Government" minLength={3} maxLength={80} required disabled={busy} value={workspaceName} onChange={e => setWorkspaceName(e.target.value)} /></label><label className="field">Your funding pool (USD)<div className="input-prefix"><span>$</span><input name="budget" aria-label="Your funding pool (USD)" type="number" min={1} max={100000000} step="0.01" required disabled={busy} value={budget || ''} onChange={e => setBudget(Number(e.target.value))} /></div></label><p className="form-help">Your workspace starts empty. Share your request form to invite organizations and build your funding cycle.</p><div className="workspace-ready"><span><span className="live-dot" /> Ready for a fairer funding cycle</span><strong>{currency(budget || 0)}</strong></div>{error && <div className="auth-error" role="alert">{error}</div>}<button className="button primary onboarding-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={17} /> Preparing your workspace…</> : <>Open my workspace <ArrowRight size={17} /></>}</button><button className="onboarding-back" type="button" onClick={() => switchScreen('school')} disabled={busy}><ArrowLeft size={14} /> Back to school details</button></form></>}
        </motion.section></AnimatePresence>
      </div><footer className="onboarding-bottom"><span><Logo small /> Made for the good you’ll do.</span><span><ShieldCheck size={13} /> Transparency from day one.</span></footer>
    </div>
  </div>
}

function ArrowUpRightIcon() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 12 12 4M4 4h8v8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> }
