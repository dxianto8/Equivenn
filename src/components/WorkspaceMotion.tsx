import { useLayoutEffect, useRef, useState } from 'react'
import { animate as animateValue, stagger, useAnimate, useReducedMotion } from 'motion/react'

export function useWorkspaceMotion(page: string, chartMode: string, allocated: number) {
  const [scope, animate] = useAnimate<HTMLDivElement>()
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    if (!scope.current || reduced) return
    const nodes = scope.current.querySelectorAll<HTMLElement>('.page-heading, .stat-card, .charts-grid > .panel, .insight-banner, .requests-panel, .organization-card, .ledger-banner, .ledger-metrics, .analytics-grid > .panel, .request-summary')
    if (!nodes.length) return
    const controls = animate(nodes, { opacity: [0, 1], y: [16, 0] }, { duration: .48, delay: stagger(.035, { startDelay: .03 }), ease: [.22, 1, .36, 1] })
    return () => { controls.stop(); nodes.forEach(node => { node.style.opacity = ''; node.style.transform = '' }) }
  }, [page, reduced, scope, animate])
  useLayoutEffect(() => {
    if (!scope.current || reduced) return
    const bars = scope.current.querySelectorAll<HTMLElement>('.bar')
    if (!bars.length) return
    const controls = animate(bars, { scaleY: [0, 1] }, { duration: .7, delay: stagger(.035), ease: [.22, 1, .36, 1] })
    return () => { controls.stop(); bars.forEach(bar => { bar.style.transform = '' }) }
  }, [page, chartMode, allocated, reduced, scope, animate])
  return scope
}

const formatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export function AnimatedNumber({ value }: { value: string }) {
  const target = Number(value.replace(/[^\d.]/g, ''))
  const [shown, setShown] = useState(target)
  const previous = useRef(0)
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    if (reduced) { setShown(target); previous.current = target; return }
    const controls = animateValue(previous.current, target, { duration: .9, ease: [.22, 1, .36, 1], onUpdate: next => { previous.current = next; setShown(Math.round(next)) } })
    return () => controls.stop()
  }, [target, reduced])
  return <>{value.startsWith('$') ? `$${formatter.format(shown)}` : String(shown).padStart(value.length, '0')}</>
}
