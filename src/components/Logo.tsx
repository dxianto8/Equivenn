export default function Logo({ small = false }: { small?: boolean }) {
  return <span className={`brand ${small ? 'small-brand' : ''}`}><svg viewBox="0 0 32 35" fill="none" aria-hidden="true"><path d="M16 1 30 9v16l-14 8L2 25V9L16 1Z" stroke="currentColor" strokeWidth="2.2" /><path d="m2 9 14 8 14-8M16 17v16M9 5l14 8v8l-7 4-7-4V13l14-8" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /></svg>{!small && <>Equi<span>venn</span><i /></>}</span>
}
