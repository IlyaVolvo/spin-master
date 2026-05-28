import { useState, useEffect } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';

interface ClubPlan {
  id: number;
  name: string;
  type: 'PERIOD' | 'VISIT_COUNT';
  isActive: boolean;
  sortOrder: number;
  config: {
    periodUnit?: string;
    periodValue?: number;
    visitCount?: number;
    prices: Record<string, { priceCents: number; isDefault?: boolean }>;
  };
}

type PlanFormData = {
  name: string;
  type: 'PERIOD' | 'VISIT_COUNT';
  sortOrder: number;
  periodUnit: string;
  periodValue: number;
  visitCount: number;
  prices: Record<string, number>; // category → cents
};

const PERIOD_UNITS = ['DAY', 'WEEK', 'MONTH', 'YEAR'] as const;

function getEmptyForm(): PlanFormData {
  return {
    name: '',
    type: 'PERIOD',
    sortOrder: 0,
    periodUnit: 'MONTH',
    periodValue: 1,
    visitCount: 10,
    prices: { Normal: 0 },
  };
}

function planToForm(plan: ClubPlan): PlanFormData {
  const prices: Record<string, number> = {};
  for (const [cat, val] of Object.entries(plan.config.prices || {})) {
    prices[cat] = val.priceCents;
  }
  return {
    name: plan.name,
    type: plan.type,
    sortOrder: plan.sortOrder,
    periodUnit: plan.config.periodUnit || 'MONTH',
    periodValue: plan.config.periodValue || 1,
    visitCount: plan.config.visitCount || 10,
    prices,
  };
}

function formToPayload(form: PlanFormData) {
  const prices: Record<string, { priceCents: number }> = {};
  for (const [cat, cents] of Object.entries(form.prices)) {
    prices[cat] = { priceCents: cents };
  }
  const config: Record<string, unknown> = { prices };
  if (form.type === 'PERIOD') {
    config.periodUnit = form.periodUnit;
    config.periodValue = form.periodValue;
  } else {
    config.visitCount = form.visitCount;
  }
  return {
    name: form.name,
    type: form.type,
    sortOrder: form.sortOrder,
    config,
  };
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function describePlan(plan: ClubPlan): string {
  const cfg = plan.config;
  if (plan.type === 'PERIOD') {
    const unit = (cfg.periodUnit || 'MONTH').toLowerCase();
    const val = cfg.periodValue || 1;
    return val === 1 ? `1 ${unit}` : `${val} ${unit}s`;
  }
  return `${cfg.visitCount || '?'} visits`;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export default function ClubPlanManager() {
  const [plans, setPlans] = useState<ClubPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Edit / Create
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null); // null = creating new
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<PlanFormData>(getEmptyForm());
  const [saving, setSaving] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Price category input
  const [newCategory, setNewCategory] = useState('');

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

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const openCreate = () => {
    setEditingPlanId(null);
    setForm(getEmptyForm());
    setShowForm(true);
    setError('');
  };

  const openEdit = (plan: ClubPlan) => {
    setEditingPlanId(plan.id);
    setForm(planToForm(plan));
    setShowForm(true);
    setError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Plan name is required'); return; }
    if (Object.keys(form.prices).length === 0) { setError('At least one price category is required'); return; }

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
        flash(`"${plan.name}" deactivated`);
      } else {
        await api.put(`/club/admin/plans/${plan.id}`, { isActive: true });
        flash(`"${plan.name}" reactivated`);
      }
      await fetchPlans();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update plan'));
    }
  };

  const addPriceCategory = () => {
    const cat = newCategory.trim();
    if (!cat || cat in form.prices) return;
    setForm({ ...form, prices: { ...form.prices, [cat]: 0 } });
    setNewCategory('');
  };

  const removePriceCategory = (cat: string) => {
    const next = { ...form.prices };
    delete next[cat];
    setForm({ ...form, prices: next });
  };

  const updatePrice = (cat: string, cents: number) => {
    setForm({ ...form, prices: { ...form.prices, [cat]: cents } });
  };

  // Filter plans
  const visiblePlans = showInactive ? plans : plans.filter(p => p.isActive);

  if (loading) return <div style={{ padding: '12px', color: '#666' }}>Loading plans...</div>;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <h3 style={{ margin: 0, color: '#2c3e50' }}>Payment Plans</h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <label style={{ fontSize: '13px', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
            Show inactive
          </label>
          {!showForm && (
            <button onClick={openCreate} style={{ padding: '6px 14px', fontSize: '13px', fontWeight: 600 }}>
              + New Plan
            </button>
          )}
        </div>
      </div>

      {error && <div className="error-message" style={{ marginBottom: '12px' }}>{error}</div>}
      {message && <div className="success-message" style={{ marginBottom: '12px' }}>{message}</div>}

      {/* Plan Form (create/edit) */}
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
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Monthly, 10-Visit Pack"
              />
            </div>
            <div>
              <label style={labelStyle}>Type</label>
              <select
                style={inputStyle}
                value={form.type}
                onChange={e => setForm({ ...form, type: e.target.value as 'PERIOD' | 'VISIT_COUNT' })}
              >
                <option value="PERIOD">Time Period</option>
                <option value="VISIT_COUNT">Visit Count</option>
              </select>
            </div>
          </div>

          {form.type === 'PERIOD' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Period Unit</label>
                <select style={inputStyle} value={form.periodUnit} onChange={e => setForm({ ...form, periodUnit: e.target.value })}>
                  {PERIOD_UNITS.map(u => <option key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Period Value</label>
                <input type="number" min={1} style={inputStyle} value={form.periodValue} onChange={e => setForm({ ...form, periodValue: Number(e.target.value) })} />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Number of Visits</label>
              <input type="number" min={1} style={{ ...inputStyle, maxWidth: '200px' }} value={form.visitCount} onChange={e => setForm({ ...form, visitCount: Number(e.target.value) })} />
            </div>
          )}

          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Sort Order</label>
            <input type="number" style={{ ...inputStyle, maxWidth: '120px' }} value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          </div>

          {/* Prices by category */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Prices by Category</label>
            {Object.entries(form.prices).map(([cat, cents]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ minWidth: '80px', fontWeight: 500, fontSize: '14px' }}>{cat}</span>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <span style={{ position: 'absolute', left: '8px', color: '#666', fontSize: '14px', pointerEvents: 'none' }}>$</span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={(cents / 100).toFixed(2)}
                    onChange={e => updatePrice(cat, Math.round(Number(e.target.value) * 100))}
                    style={{ ...inputStyle, width: '130px', paddingLeft: '22px' }}
                  />
                </div>
                {Object.keys(form.prices).length > 1 && (
                  <button
                    onClick={() => removePriceCategory(cat)}
                    style={{ ...smallBtnStyle, backgroundColor: '#e74c3c', color: 'white' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
              <input
                style={{ ...inputStyle, width: '140px' }}
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPriceCategory(); } }}
                placeholder="New category..."
              />
              <button
                onClick={addPriceCategory}
                disabled={!newCategory.trim() || newCategory.trim() in form.prices}
                style={{ ...smallBtnStyle, backgroundColor: '#27ae60', color: 'white', opacity: (!newCategory.trim() || newCategory.trim() in form.prices) ? 0.5 : 1 }}
              >
                Add
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <button onClick={() => setShowForm(false)} style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', fontSize: '13px' }}>
              {saving ? 'Saving...' : (editingPlanId !== null ? 'Update Plan' : 'Create Plan')}
            </button>
          </div>
        </div>
      )}

      {/* Plan List */}
      {visiblePlans.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
          {plans.length === 0 ? 'No plans created yet.' : 'No active plans. Toggle "Show inactive" to see deactivated plans.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visiblePlans.map(plan => (
            <div
              key={plan.id}
              className="card"
              style={{
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: plan.isActive ? 1 : 0.55,
                borderLeft: plan.isActive ? '4px solid #27ae60' : '4px solid #bdc3c7',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '15px', color: '#2c3e50' }}>
                  {plan.name}
                  {!plan.isActive && <span style={{ marginLeft: '8px', fontSize: '11px', color: '#e74c3c', fontWeight: 700 }}>INACTIVE</span>}
                </div>
                <div style={{ fontSize: '13px', color: '#666', marginTop: '2px' }}>
                  {plan.type === 'PERIOD' ? 'Time Period' : 'Visit Count'} &mdash; {describePlan(plan)}
                </div>
                <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                  {Object.entries(plan.config.prices || {}).map(([cat, val]) => (
                    <span key={cat} style={{ marginRight: '10px' }}>{cat}: {formatCents(val.priceCents)}</span>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
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
      )}
    </div>
  );
}
