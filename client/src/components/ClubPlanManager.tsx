import { useState, useEffect } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';
import { getSystemConfig, subscribeToSystemConfig } from '../utils/systemConfig';

interface ClubPlan {
  id: number;
  familyKey: string;
  name: string;
  kind: 'TIME' | 'VISIT';
  segment: string;
  priceCents: number;
  currency: string;
  durationUnit?: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR' | null;
  durationValue?: number | null;
  visitCount?: number | null;
  isActive: boolean;
  sortOrder: number;
}

type PlanFormData = {
  familyKey: string;
  name: string;
  kind: 'TIME' | 'VISIT';
  segment: string;
  /** TIME: total cents. VISIT: per-visit cents. */
  priceCents: number;
  durationUnit: 'DAY' | 'WEEK' | 'MONTH' | 'QUARTER' | 'YEAR';
  durationValue: number;
  visitCount: number;
  sortOrder: number;
};

const DURATION_UNITS = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'] as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '14px',
  borderRadius: '5px',
  border: '1px solid #b9c7d8',
  backgroundColor: '#f8fbff',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontWeight: 600,
  fontSize: '13px',
  color: '#2d6f8f',
  marginBottom: '4px',
};

const smallBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: '12px',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 600,
};

function getEmptyForm(defaultSegment = 'Regular'): PlanFormData {
  return {
    familyKey: '',
    name: '',
    kind: 'TIME',
    segment: defaultSegment,
    priceCents: 100,
    durationUnit: 'MONTH',
    durationValue: 1,
    visitCount: 10,
    sortOrder: 0,
  };
}

function planToForm(plan: ClubPlan): PlanFormData {
  return {
    familyKey: plan.familyKey,
    name: plan.name,
    kind: plan.kind,
    segment: plan.segment,
    priceCents: plan.priceCents,
    durationUnit: plan.durationUnit || 'MONTH',
    durationValue: plan.durationValue || 1,
    visitCount: plan.visitCount || 10,
    sortOrder: plan.sortOrder,
  };
}

function formToPayload(form: PlanFormData) {
  const payload: Record<string, unknown> = {
    familyKey: form.familyKey.trim() || undefined,
    name: form.name.trim(),
    kind: form.kind,
    segment: form.segment,
    priceCents: form.priceCents,
    sortOrder: form.sortOrder,
  };
  if (form.kind === 'TIME') {
    payload.durationUnit = form.durationUnit;
    payload.durationValue = form.durationValue;
  } else {
    payload.visitCount = form.visitCount;
  }
  return payload;
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function planTotalCents(plan: Pick<ClubPlan, 'kind' | 'priceCents' | 'visitCount'>): number {
  if (plan.kind === 'VISIT') {
    return (plan.priceCents || 0) * Math.max(0, plan.visitCount || 0);
  }
  return plan.priceCents || 0;
}

function describePlan(plan: ClubPlan): string {
  if (plan.kind === 'TIME') {
    const unit = (plan.durationUnit || 'MONTH').toLowerCase();
    const val = plan.durationValue || 1;
    return val === 1 ? `1 ${unit}` : `${val} ${unit}s`;
  }
  return `${plan.visitCount || '?'} visits`;
}

function describePrice(plan: ClubPlan): string {
  if (plan.kind === 'VISIT') {
    const visits = plan.visitCount || 0;
    return `${formatCents(plan.priceCents)}/visit · total ${formatCents(planTotalCents(plan))} (${visits})`;
  }
  return formatCents(plan.priceCents);
}

/** Dollar amount input: defaults to 0.00; focus selects all so typing overwrites. */
function MoneyInput({
  cents,
  onCentsChange,
  inputKey,
}: {
  cents: number;
  onCentsChange: (cents: number) => void;
  inputKey: string;
}) {
  const [text, setText] = useState(() => (cents / 100).toFixed(2));

  useEffect(() => {
    setText((cents / 100).toFixed(2));
    // Reset display only when the form opens / switches plan — not on each keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKey]);

  const commit = (raw: string) => {
    const cleaned = raw.trim();
    const n = cleaned === '' || cleaned === '.' ? 0 : Number(cleaned);
    const nextCents = Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
    onCentsChange(nextCents);
    setText((nextCents / 100).toFixed(2));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      style={inputStyle}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        const normalized =
          parts.length <= 1
            ? v
            : `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
        setText(normalized);
        if (normalized !== '' && normalized !== '.' && Number.isFinite(Number(normalized))) {
          onCentsChange(Math.round(Number(normalized) * 100));
        }
      }}
      onBlur={() => commit(text)}
      placeholder="0.00"
    />
  );
}

export default function ClubPlanManager() {
  const [plans, setPlans] = useState<ClubPlan[]>([]);
  const [segments, setSegments] = useState<string[]>(() => getSystemConfig().clubPlans.segments);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlanFormData>(getEmptyForm());
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [priceFieldKey, setPriceFieldKey] = useState(0);

  const fetchPlans = async () => {
    try {
      const res = await api.get('/club/admin/plans');
      setPlans(res.data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load plans'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPlans(); }, []);

  useEffect(() => {
    return subscribeToSystemConfig((config) => {
      setSegments(config.clubPlans.segments);
    });
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const openCreate = (preset?: Partial<PlanFormData>) => {
    setEditingPlanId(null);
    setForm({ ...getEmptyForm('Regular'), ...preset });
    setPriceFieldKey((k) => k + 1);
    setShowForm(true);
    setError('');
  };

  const openEdit = (plan: ClubPlan) => {
    setEditingPlanId(plan.id);
    setForm(planToForm(plan));
    setPriceFieldKey((k) => k + 1);
    setShowForm(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Plan name is required'); return; }
    if (!form.segment.trim()) { setError('Segment is required'); return; }
    if (!Number.isInteger(form.priceCents) || form.priceCents < 1) {
      setError('Price must be greater than $0.00');
      return;
    }
    if (form.segment !== 'Regular') {
      const familyKey = form.familyKey.trim() || form.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const hasRegular = plans.some(
        (p) => p.familyKey === familyKey && p.segment === 'Regular' && (editingPlanId == null || p.id !== editingPlanId),
      );
      const familyHasRegular = plans.some((p) => {
        return p.familyKey === (form.familyKey.trim() || familyKey) && p.segment === 'Regular';
      });
      if (!hasRegular && !familyHasRegular) {
        setError('Create a Regular plan for this family before adding other segments');
        return;
      }
    }

    setSaving(true);
    setError('');
    try {
      const payload = formToPayload(form);
      if (editingPlanId !== null) {
        await api.put(`/club/admin/plans/${editingPlanId}`, payload);
        flash('Plan updated');
      } else {
        await api.post('/club/admin/plans', payload);
        flash('Plan created');
      }
      setShowForm(false);
      await fetchPlans();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save plan'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (plan: ClubPlan) => {
    try {
      if (plan.isActive) {
        await api.delete(`/club/admin/plans/${plan.id}`);
        flash(`"${plan.name}" (${plan.segment}) deactivated`);
      } else {
        await api.put(`/club/admin/plans/${plan.id}`, { isActive: true });
        flash(`"${plan.name}" (${plan.segment}) reactivated`);
      }
      await fetchPlans();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update plan'));
    }
  };

  const visiblePlans = showInactive ? plans : plans.filter((p) => p.isActive);

  const families = Array.from(
    visiblePlans.reduce((map, plan) => {
      const list = map.get(plan.familyKey) || [];
      list.push(plan);
      map.set(plan.familyKey, list);
      return map;
    }, new Map<string, ClubPlan[]>()),
  );

  const visitTotalCents = form.priceCents * Math.max(0, form.visitCount || 0);

  if (loading) return <div style={{ padding: '12px', color: '#666' }}>Loading plans...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50' }}>Payment Plans</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {!showForm && (
            <button onClick={() => openCreate()} style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}>
              + New Plan
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message" style={{ marginBottom: '12px' }}>{error}</div>}
      {message && <div className="success-message" style={{ marginBottom: '12px' }}>{message}</div>}

      {showForm && (
        <div className="card" style={{ marginBottom: '16px', border: '2px solid #3498db', padding: '16px' }}>
          <h4 style={{ margin: '0 0 14px', color: '#2c3e50' }}>
            {editingPlanId !== null ? 'Edit Plan' : 'New Plan'}
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Monthly, 10-Visit Pack"
              />
            </div>
            <div>
              <label style={labelStyle}>Family key</label>
              <input
                style={inputStyle}
                value={form.familyKey}
                onChange={(e) => setForm({ ...form, familyKey: e.target.value })}
                placeholder="auto from name if empty"
                disabled={editingPlanId !== null}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Kind</label>
              <select
                style={inputStyle}
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as 'TIME' | 'VISIT' })}
              >
                <option value="TIME">Time</option>
                <option value="VISIT">Visit pack</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Segment</label>
              <select
                style={inputStyle}
                value={form.segment}
                onChange={(e) => setForm({ ...form, segment: e.target.value })}
              >
                {segments.map((seg) => (
                  <option key={seg} value={seg}>{seg}</option>
                ))}
              </select>
            </div>
          </div>

          {form.kind === 'TIME' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Duration unit</label>
                <select
                  style={inputStyle}
                  value={form.durationUnit}
                  onChange={(e) => setForm({ ...form, durationUnit: e.target.value as PlanFormData['durationUnit'] })}
                >
                  {DURATION_UNITS.map((u) => (
                    <option key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Duration value</label>
                <input
                  type="number"
                  min={1}
                  style={inputStyle}
                  value={form.durationValue}
                  onChange={(e) => setForm({ ...form, durationValue: Number(e.target.value) })}
                />
              </div>
              <div>
                <label style={labelStyle}>Total price ($)</label>
                <MoneyInput
                  inputKey={`time-${priceFieldKey}`}
                  cents={form.priceCents}
                  onCentsChange={(priceCents) => setForm({ ...form, priceCents })}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Number of visits</label>
                <input
                  type="number"
                  min={1}
                  style={inputStyle}
                  value={form.visitCount}
                  onChange={(e) => setForm({ ...form, visitCount: Number(e.target.value) })}
                />
              </div>
              <div>
                <label style={labelStyle}>Price per visit ($)</label>
                <MoneyInput
                  inputKey={`visit-${priceFieldKey}`}
                  cents={form.priceCents}
                  onCentsChange={(priceCents) => setForm({ ...form, priceCents })}
                />
              </div>
              <div>
                <label style={labelStyle}>Total</label>
                <div style={{ ...inputStyle, backgroundColor: '#eef3f8', color: '#2c3e50', fontWeight: 600 }}>
                  {formatCents(visitTotalCents)}
                  <span style={{ fontWeight: 400, color: '#666', marginLeft: '6px', fontSize: '12px' }}>
                    ({form.visitCount || 0} × {formatCents(form.priceCents)})
                  </span>
                </div>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Sort order</label>
            <input
              type="number"
              style={{ ...inputStyle, maxWidth: '120px' }}
              value={form.sortOrder}
              onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <button
              onClick={() => setShowForm(false)}
              style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', fontSize: '13px' }}>
              {saving ? 'Saving...' : (editingPlanId !== null ? 'Update Plan' : 'Create Plan')}
            </button>
          </div>
        </div>
      )}

      {families.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
          {plans.length === 0 ? 'No plans created yet.' : 'No active plans. Toggle "Show inactive" to see deactivated plans.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {families.map(([familyKey, familyPlans]) => {
            const head = familyPlans[0];
            const hasRegular = familyPlans.some((p) => p.segment === 'Regular');
            return (
              <div key={familyKey} className="card" style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: '#2c3e50' }}>
                      {head.name}
                      <span style={{ marginLeft: '8px', fontSize: '12px', color: '#888', fontWeight: 500 }}>
                        {familyKey} · {head.kind === 'TIME' ? 'Time' : 'Visit'} · {describePlan(head)}
                      </span>
                    </div>
                    {!hasRegular && (
                      <div style={{ fontSize: '12px', color: '#c0392b', marginTop: '2px' }}>
                        Missing Regular segment — add one before selling this family
                      </div>
                    )}
                  </div>
                  {!showForm && (
                    <button
                      onClick={() => openCreate({
                        familyKey,
                        name: head.name,
                        kind: head.kind,
                        durationUnit: head.durationUnit || 'MONTH',
                        durationValue: head.durationValue || 1,
                        visitCount: head.visitCount || 10,
                        sortOrder: head.sortOrder,
                        segment: segments.find((s) => s !== 'Regular' && !familyPlans.some((p) => p.segment === s)) || 'Regular',
                      })}
                      style={{ ...smallBtnStyle, backgroundColor: '#27ae60', color: 'white' }}
                    >
                      + Segment
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {familyPlans.map((plan) => (
                    <div
                      key={plan.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        background: '#f8fbff',
                        borderRadius: '5px',
                        opacity: plan.isActive ? 1 : 0.55,
                        borderLeft: plan.isActive ? '3px solid #27ae60' : '3px solid #bdc3c7',
                      }}
                    >
                      <div style={{ fontSize: '14px' }}>
                        <strong>{plan.segment}</strong>
                        <span style={{ marginLeft: '10px', color: '#555' }}>{describePrice(plan)}</span>
                        {!plan.isActive && (
                          <span style={{ marginLeft: '8px', fontSize: '11px', color: '#e74c3c', fontWeight: 700 }}>INACTIVE</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => openEdit(plan)}
                          style={{ ...smallBtnStyle, backgroundColor: '#3498db', color: 'white' }}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleToggleActive(plan)}
                          style={{
                            ...smallBtnStyle,
                            backgroundColor: plan.isActive ? '#e74c3c' : '#27ae60',
                            color: 'white',
                          }}
                        >
                          {plan.isActive ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
