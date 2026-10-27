export const fundingCategories = ['Community', 'Academic', 'Arts & culture', 'Sports & wellbeing'] as const

export default function FundingFields({ contact = false }: { contact?: boolean }) {
  return <div className="form-grid">
    {contact && <><label className="field">Your name<input name="contactName" autoComplete="name" minLength={2} maxLength={80} placeholder="Jamie Lewis" required /></label><label className="field">Contact email<input name="contactEmail" type="email" autoComplete="email" maxLength={254} placeholder="you@school.edu" required /></label></>}
    <label className="field">Organization name<input name="name" placeholder="e.g. Campus Sustainability Society" minLength={3} maxLength={80} required /></label>
    <label className="field">Area of impact<select name="category">{fundingCategories.map(category => <option key={category}>{category}</option>)}</select></label>
    <label className="field">Funding requested (USD)<div className="input-prefix"><span>$</span><input name="requested" type="number" min="1" max="10000000" step="0.01" placeholder="10,000" required /></div></label>
    <label className="field">Active members<input name="members" type="number" min="1" max="1000000" step="1" placeholder="100" required /></label>
    <label className="field">Community impact score <small>0–100 · use your council’s assessment rubric</small><input name="impact" type="number" min="0" max="100" step="1" placeholder="80" required /></label>
    <label className="field">Previous funding utilization <small>0–100% · use of prior funding</small><div className="input-prefix suffix"><input name="utilization" type="number" min="0" max="100" step="1" placeholder="90" required /><span>%</span></div></label>
    <label className="field field-full">What will this funding make possible?<textarea name="description" placeholder="Describe your activities, intended use of funds, and who will benefit…" maxLength={1000} rows={4} required /></label>
  </div>
}
