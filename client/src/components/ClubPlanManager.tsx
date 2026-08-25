import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';
import { getSystemConfig, subscribeToSystemConfig } from '../utils/systemConfig';
import { useBusyAction } from '../hooks/useBusyAction';

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
  hostPerkDays?: number;
  hostPerkVisits?: number;
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
  hostPerkDays: number;
  hostPerkVisits: number;
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
    hostPerkDays: 0,
    hostPerkVisits: 0,
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
    durationValue: plan.durationValue && plan.durationValue >= 1 ? plan.durationValue : 1,
    visitCount: plan.visitCount || 10,
    hostPerkDays: plan.hostPerkDays || 0,
    hostPerkVisits: plan.hostPerkVisits || 0,
    sortOrder: plan.sortOrder,
  };
}

function formToPayload(form: PlanFormData, includeSortOrder: boolean) {
  const payload: Record<string, unknown> = {
    familyKey: form.familyKey.trim() || undefined,
    name: form.name.trim(),
    kind: form.kind,
    segment: form.segment,
    priceCents: form.priceCents,
  };
  if (includeSortOrder) payload.sortOrder = form.sortOrder;
  if (form.kind === 'TIME') {
    payload.durationUnit = form.durationUnit;
    payload.durationValue = Math.max(1, Math.floor(form.durationValue) || 1);
    payload.hostPerkDays = form.hostPerkDays;
  } else {
    payload.visitCount = form.visitCount;
    payload.hostPerkVisits = form.hostPerkVisits;
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

function describeHostPerk(plan: ClubPlan): string {
  if (plan.kind === 'TIME') {
    const n = plan.hostPerkDays || 0;
    return n === 1 ? 'Host perk: +1 day' : `Host perk: +${n} days`;
  }
  const n = plan.hostPerkVisits || 0;
  return n === 1 ? 'Host perk: +1 visit' : `Host perk: +${n} visits`;
}

/** Dollar amount input: defaults to 0.00; focus selects all so typing overwrites. */
function MoneyInput({
  cents,
  onCentsChange,
  inputKey,
  dataTutorial,
}: {
  cents: number;
  onCentsChange: (cents: number) => void;
  inputKey: string;
  dataTutorial?: string;
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
      data-tutorial={dataTutorial}
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

/** Integer ≥ 1. Focus selects the current value so the next key overwrites it. */
function MinOneNumberInput({
  value,
  onChange,
  disabled,
  style,
}: {
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  style?: React.CSSProperties;
}) {
  const shown = Math.max(1, Math.floor(value) || 1);
  const [text, setText] = useState(String(shown));

  useEffect(() => {
    setText(String(Math.max(1, Math.floor(value) || 1)));
  }, [value]);

  const commit = (raw: string) => {
    const n = Math.max(1, Math.floor(Number(raw)) || 1);
    setText(String(n));
    onChange(n);
  };

  return (
    <input
      type="number"
      min={1}
      inputMode="numeric"
      style={style}
      value={text}
      disabled={disabled}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const n = Number(raw);
        if (Number.isInteger(n) && n >= 1) onChange(n);
      }}
      onBlur={() => commit(text)}
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
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'add-segment'>('create');
  const [form, setForm] = useState<PlanFormData>(getEmptyForm());
  const [saving, setSaving] = useState(false);
  const { busy: toggleBusy, runBusy: runToggleBusy } = useBusyAction();
  const [showInactive, setShowInactive] = useState(false);
  const [priceFieldKey, setPriceFieldKey] = useState(0);
  const [draggingFamily, setDraggingFamily] = useState<string | null>(null);
  const [dragOverFamily, setDragOverFamily] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const draggingFamilyRef = useRef<string | null>(null);

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
    setFormMode(preset?.familyKey ? 'add-segment' : 'create');
    const nextOrder =
      preset?.sortOrder ??
      (plans.length === 0 ? 0 : Math.max(...plans.map((p) => p.sortOrder)) + 1);
    setForm({ ...getEmptyForm('Regular'), ...preset, sortOrder: nextOrder });
    setPriceFieldKey((k) => k + 1);
    setShowForm(true);
    setError('');
  };

  const openEdit = (plan: ClubPlan) => {
    setEditingPlanId(plan.id);
    setFormMode('edit');
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
    if (form.kind === 'TIME' && (!Number.isInteger(form.durationValue) || form.durationValue < 1)) {
      setError('Duration must be at least 1');
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
      const payload = formToPayload(form, editingPlanId === null);
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
    await runToggleBusy(async () => {
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
    });
  };

  const persistFamilyOrder = async (orderedKeys: string[]) => {
    const previous = plans;
    setPlans((current) =>
      current
        .map((p) => {
          const idx = orderedKeys.indexOf(p.familyKey);
          return idx >= 0 ? { ...p, sortOrder: idx } : p;
        })
        .sort((a, b) => a.sortOrder - b.sortOrder || a.familyKey.localeCompare(b.familyKey) || a.segment.localeCompare(b.segment)),
    );
    setReordering(true);
    setError('');
    try {
      const updates: Promise<unknown>[] = [];
      orderedKeys.forEach((familyKey, idx) => {
        const familyPlans = previous.filter((p) => p.familyKey === familyKey);
        const regular = familyPlans.find((p) => p.segment === 'Regular');
        if (regular) {
          updates.push(api.put(`/club/admin/plans/${regular.id}`, { sortOrder: idx }));
        } else {
          familyPlans.forEach((p) => {
            updates.push(api.put(`/club/admin/plans/${p.id}`, { sortOrder: idx }));
          });
        }
      });
      await Promise.all(updates);
      await fetchPlans();
    } catch (err) {
      setPlans(previous);
      setError(getErrorMessage(err, 'Failed to reorder plans'));
    } finally {
      setReordering(false);
    }
  };

  const applyDrop = (fromKey: string, toKey: string) => {
    if (!fromKey || !toKey || fromKey === toKey) return;
    const keys = families.map(([k]) => k);
    const from = keys.indexOf(fromKey);
    const to = keys.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const next = [...keys];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    void persistFamilyOrder(next);
  };

  const canDrag = !showForm && !reordering;

  const visiblePlans = (showInactive ? plans : plans.filter((p) => p.isActive))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.familyKey.localeCompare(b.familyKey) || a.segment.localeCompare(b.segment));

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
            {editingPlanId !== null
              ? 'Edit Plan'
              : formMode === 'add-segment'
                ? 'Add category price'
                : 'New Plan'}
          </h4>
          {formMode === 'add-segment' && (
            <p style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#546e7a' }}>
              Adding a category to <strong>{form.name || 'this plan'}</strong>. Name, kind, and duration stay the same — choose segment and set price.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Monthly, 10-Visit Pack"
                disabled={formMode === 'add-segment'}
                data-tutorial="plan-form-name"
              />
            </div>
            <div>
              <label style={labelStyle}>Family key</label>
              <input
                style={inputStyle}
                value={form.familyKey}
                onChange={(e) => setForm({ ...form, familyKey: e.target.value })}
                placeholder="auto from name if empty"
                disabled={editingPlanId !== null || formMode === 'add-segment'}
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
                disabled={formMode === 'add-segment'}
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
                data-tutorial="plan-form-segment"
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
                  disabled={formMode === 'add-segment'}
                >
                  {DURATION_UNITS.map((u) => (
                    <option key={u} value={u}>{u.charAt(0) + u.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Duration value</label>
                <MinOneNumberInput
                  style={inputStyle}
                  value={form.durationValue}
                  onChange={(durationValue) => setForm({ ...form, durationValue })}
                  disabled={formMode === 'add-segment'}
                />
              </div>
              <div>
                <label style={labelStyle}>Total price ($)</label>
                <MoneyInput
                  inputKey={`time-${priceFieldKey}`}
                  cents={form.priceCents}
                  onCentsChange={(priceCents) => setForm({ ...form, priceCents })}
                  dataTutorial="plan-form-price"
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
                  disabled={formMode === 'add-segment'}
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

          <div
            style={{
              marginBottom: '12px',
              padding: '10px 12px',
              border: '1px solid #d5e6ef',
              borderRadius: '6px',
              background: '#f4fafc',
            }}
          >
            <label
              style={{ ...labelStyle, cursor: 'help' }}
              title={
                form.kind === 'TIME'
                  ? 'Number of days added to the plan. 1 covers the day of duty.'
                  : 'Number of visits added to the plan. 1 covers the day of duty.'
              }
            >
              Host perks
            </label>
            {form.kind === 'TIME' ? (
              <input
                type="number"
                min={0}
                style={{ ...inputStyle, maxWidth: '120px' }}
                value={form.hostPerkDays}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, hostPerkDays: Math.max(0, Number(e.target.value) || 0) })}
              />
            ) : (
              <input
                type="number"
                min={0}
                style={{ ...inputStyle, maxWidth: '120px' }}
                value={form.hostPerkVisits}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm({ ...form, hostPerkVisits: Math.max(0, Number(e.target.value) || 0) })}
              />
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid #eee', paddingTop: '12px' }}>
            <button
              onClick={() => setShowForm(false)}
              style={{ padding: '8px 16px', fontSize: '13px', backgroundColor: '#95a5a6', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', fontSize: '13px' }}>
              {saving
                ? 'Saving...'
                : editingPlanId !== null
                  ? 'Update Plan'
                  : formMode === 'add-segment'
                    ? 'Add price'
                    : 'Create Plan'}
            </button>
          </div>
        </div>
      )}

      {families.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
          {plans.length === 0 ? 'No plans created yet.' : 'No active plans. Toggle "Show inactive" to see deactivated plans.'}
        </div>
      ) : (
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
          onDragOver={(e) => {
            if (!canDrag || !draggingFamilyRef.current) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
          }}
        >
          {families.map(([familyKey, familyPlans]) => {
            const head = familyPlans[0];
            const hasRegular = familyPlans.some((p) => p.segment === 'Regular');
            const isDragging = draggingFamily === familyKey;
            const isDropTarget = dragOverFamily === familyKey && draggingFamily != null && draggingFamily !== familyKey;
            return (
              <div
                key={familyKey}
                className="card"
                onDragOver={(e) => {
                  if (!canDrag || !draggingFamilyRef.current) return;
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = 'move';
                  if (dragOverFamily !== familyKey) setDragOverFamily(familyKey);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const fromKey = e.dataTransfer.getData('text/plain') || draggingFamilyRef.current || '';
                  draggingFamilyRef.current = null;
                  setDraggingFamily(null);
                  setDragOverFamily(null);
                  if (!canDrag) return;
                  applyDrop(fromKey, familyKey);
                }}
                style={{
                  padding: '12px 16px',
                  opacity: isDragging ? 0.55 : 1,
                  outline: isDropTarget ? '2px solid #3498db' : undefined,
                  background: isDropTarget ? '#eef7fb' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', minWidth: 0 }}>
                    <span
                      draggable={canDrag}
                      onDragStart={(e) => {
                        if (!canDrag) {
                          e.preventDefault();
                          return;
                        }
                        draggingFamilyRef.current = familyKey;
                        setDraggingFamily(familyKey);
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', familyKey);
                      }}
                      onDragEnd={() => {
                        draggingFamilyRef.current = null;
                        setDraggingFamily(null);
                        setDragOverFamily(null);
                      }}
                      title={showForm ? 'Reorder is disabled while a plan is being edited' : 'Drag to reorder'}
                      style={{
                        fontSize: '16px',
                        color: canDrag ? '#999' : '#d0d5db',
                        cursor: canDrag ? 'grab' : 'not-allowed',
                        userSelect: 'none',
                        lineHeight: '20px',
                        paddingTop: '2px',
                      }}
                    >
                      ⋮⋮
                    </span>
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
                        <span style={{ marginLeft: '10px', color: '#2d6f8f' }}>{describeHostPerk(plan)}</span>
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
                          disabled={toggleBusy}
                          style={{
                            ...smallBtnStyle,
                            backgroundColor: plan.isActive ? '#e74c3c' : '#27ae60',
                            color: 'white',
                            opacity: toggleBusy ? 0.7 : 1,
                            cursor: toggleBusy ? 'not-allowed' : 'pointer',
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
