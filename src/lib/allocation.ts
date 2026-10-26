export type Category = 'Community' | 'Academic' | 'Arts & culture' | 'Sports & wellbeing'
export type RequestStatus = 'Approved' | 'In review'
export interface Organization {
  id: string; name: string; initials: string; category: Category; color: string;
  requested: number; members: number; impact: number; utilization: number;
  status: RequestStatus; description: string;
}
export interface Model {
  budget: number; reserve: number;
  weights: { reach: number; impact: number; utilization: number; efficiency: number };
}
export interface Allocation extends Organization {
  award: number; score: number;
  factors: { reach: number; impact: number; utilization: number; efficiency: number };
}
export const defaultModel: Model = {
  budget: 120000, reserve: 6,
  weights: { reach: 30, impact: 35, utilization: 20, efficiency: 15 },
}

// The solution to max Σ score_i × log(award_i), subject to the available
// budget and 0 <= award_i <= request_i. Capped water filling is deterministic.
export function allocate(organizations: Organization[], model: Model): Allocation[] {
  const approved = organizations.filter(o => o.status === 'Approved')
  const maxReach = Math.max(1, ...approved.map(o => Math.sqrt(o.members)))
  const maxEfficiency = Math.max(Number.EPSILON, ...approved.map(o => Math.sqrt(o.members / o.requested)))
  const totalWeight = Object.values(model.weights).reduce((a, b) => a + b, 0)
  const rows: Allocation[] = organizations.map(o => {
    const factors = {
      reach: Math.sqrt(o.members) / maxReach,
      impact: o.impact / 100,
      utilization: o.utilization / 100,
      efficiency: Math.sqrt(o.members / o.requested) / maxEfficiency,
    }
    const score = totalWeight > 0 ? Object.entries(model.weights).reduce((sum, [key, weight]) => sum + weight * factors[key as keyof typeof factors], 0) / totalWeight : 0
    return { ...o, factors, score: o.status === 'Approved' ? score : 0, award: 0 }
  })
  let cents = Math.max(0, Math.floor(model.budget * (1 - model.reserve / 100) * 100 + 1e-6))
  let active = rows.filter(o => o.status === 'Approved' && o.score > 0 && o.requested > 0)
  const awards = new Map<string, number>()
  while (active.length && cents > 0) {
    const scoreSum = active.reduce((sum, o) => sum + o.score, 0)
    const capped = active.filter(o => cents * o.score / scoreSum >= Math.round(o.requested * 100))
    if (capped.length) {
      for (const o of capped) {
        const amount = Math.round(o.requested * 100)
        awards.set(o.id, amount)
        cents -= amount
      }
      active = active.filter(o => !awards.has(o.id))
    } else {
      const shares = active.map(o => {
        const exact = cents * o.score / scoreSum
        return { id: o.id, amount: Math.floor(exact), remainder: exact % 1 }
      })
      let remaining = cents - shares.reduce((sum, o) => sum + o.amount, 0)
      shares.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id))
      for (const share of shares) {
        awards.set(share.id, share.amount + (remaining-- > 0 ? 1 : 0))
      }
      cents = 0
    }
  }
  return rows.map(o => ({ ...o, award: (awards.get(o.id) ?? 0) / 100 }))
}

export const initialOrganizations: Organization[] = [
  { id: 'eco', name: 'Green Campus Initiative', initials: 'GC', category: 'Community', color: 'sage', requested: 32000, members: 340, impact: 92, utilization: 96, status: 'Approved', description: 'Student-led sustainability projects, campus gardens, and community cleanups. This cycle funds a campus-wide composting program and monthly environmental workshops.' },
  { id: 'robotics', name: 'Robotics & Innovation Club', initials: 'RI', category: 'Academic', color: 'blue', requested: 28000, members: 210, impact: 96, utilization: 92, status: 'Approved', description: 'Hands-on engineering for curious minds. Funding supports open-access robotics workshops, competition materials, and mentorship for local school students.' },
  { id: 'arts', name: 'Arts Collective', initials: 'AC', category: 'Arts & culture', color: 'peach', requested: 24500, members: 185, impact: 89, utilization: 88, status: 'Approved', description: 'Making the arts accessible through student exhibitions, public performances, and shared studio supplies. All events are open to the campus community.' },
  { id: 'wellness', name: 'Student Wellness Network', initials: 'SW', category: 'Sports & wellbeing', color: 'purple', requested: 22000, members: 160, impact: 87, utilization: 94, status: 'Approved', description: 'Peer-led wellbeing programs, accessible movement sessions, and mental health awareness events designed to support students across campus.' },
  { id: 'volunteer', name: 'Community Action Society', initials: 'CA', category: 'Community', color: 'mint', requested: 18000, members: 130, impact: 91, utilization: 85, status: 'Approved', description: 'Connecting students with local volunteer opportunities. This request supports transport, volunteer training, and a neighborhood food access initiative.' },
  { id: 'debate', name: 'Debate & Policy Society', initials: 'DP', category: 'Academic', color: 'sand', requested: 16000, members: 95, impact: 82, utilization: 90, status: 'Approved', description: 'Building civic confidence through open debates, policy workshops, and intercollegiate events. Funds cover accessible participation and event resources.' },
  { id: 'culture', name: 'Global Cultures Association', initials: 'GL', category: 'Arts & culture', color: 'rose', requested: 14000, members: 85, impact: 86, utilization: 81, status: 'Approved', description: 'Celebrating the cultures that make up our campus through food, storytelling, language exchanges, and an annual community festival.' },
  { id: 'outdoor', name: 'Outdoor Adventure Club', initials: 'OA', category: 'Sports & wellbeing', color: 'sky', requested: 10000, members: 62, impact: 79, utilization: 86, status: 'Approved', description: 'Affordable outdoor experiences for all students. Funding supports shared safety equipment, beginner-friendly trips, and outdoor skills workshops.' },
]
