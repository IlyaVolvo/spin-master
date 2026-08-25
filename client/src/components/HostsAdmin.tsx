import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import api from '../utils/api';
import { getErrorMessage } from '../utils/errorHandler';
import { getSystemConfig } from '../utils/systemConfig';
import {
  type HostBoardSlot,
  hostMemberName,
  hostSlotCaption,
} from '../utils/hostBoard';

type Template = {
  id: number;
  startTime: string;
  endTime: string;
  sortOrder: number;
  label: string | null;
  isActive: boolean;
};

type Assignee = { id: number; firstName: string; lastName: string };

type BoardDay = { clubDate: string; slots: HostBoardSlot[] };

function clubTodayYmd(): string {
  const tz = getSystemConfig().branding.clubTimezone || 'UTC';
  return new Date().toLocaleDateString('en-CA', { timeZone: tz });
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function startOfWeekMonday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0 Sun
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(ymd, -back);
}

function weekdayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

const inputStyle: CSSProperties = {
  padding: '6px 8px',
  fontSize: '13px',
  borderRadius: '5px',
  border: '1px solid #b9c7d8',
  background: '#f8fbff',
};

function memberHaystack(member: Assignee): string {
  return `${member.lastName} ${member.firstName} ${member.lastName}, ${member.firstName}`
    .toLowerCase()
    .replace(/,/g, ' ');
}

function memberMatches(member: Assignee, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ');
  if (!q) return true;
  return memberHaystack(member).includes(q);
}

function AssigneePicker({
  assignees,
  value,
  onChange,
  fullWidth = false,
  expanded = false,
}: {
  assignees: Assignee[];
  value: string;
  onChange: (id: string) => void;
  fullWidth?: boolean;
  expanded?: boolean;
}) {
  const [query, setQuery] = useState('');
  const filtered = assignees.filter((m) => memberMatches(m, query));
  const selected = assignees.find((m) => String(m.id) === value);
  const options =
    selected && !filtered.some((m) => m.id === selected.id)
      ? [selected, ...filtered]
      : filtered;

  return (
    <div style={{ width: fullWidth ? '100%' : undefined, minWidth: '220px' }}>
      {expanded ? (
        <input
          type="search"
          placeholder="Search members..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length === 1) {
              e.preventDefault();
              onChange(String(filtered[0].id));
            }
          }}
          style={{ ...inputStyle, width: '100%', marginBottom: '6px' }}
        />
      ) : null}
      <select
        size={expanded ? Math.min(10, Math.max(4, options.length + 1)) : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...inputStyle, width: '100%', height: expanded ? 'auto' : undefined }}
      >
        <option value="">Unassigned</option>
        {(expanded ? options : assignees).map((m) => (
          <option key={m.id} value={m.id}>{m.lastName}, {m.firstName}</option>
        ))}
      </select>
      {assignees.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#5d6d7e', marginTop: '4px' }}>No members to assign</div>
      ) : null}
      {expanded && assignees.length > 0 && filtered.length === 0 ? (
        <div style={{ fontSize: '12px', color: '#5d6d7e', marginTop: '4px' }}>No matching members</div>
      ) : null}
    </div>
  );
}

export default function HostsAdmin() {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(clubTodayYmd()));
  const [templates, setTemplates] = useState<Template[]>([]);
  const [days, setDays] = useState<BoardDay[]>([]);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [tplStart, setTplStart] = useState('10:00');
  const [tplEnd, setTplEnd] = useState('14:00');
  const [tplLabel, setTplLabel] = useState('');

  const [customDate, setCustomDate] = useState(clubTodayYmd());
  const [customStart, setCustomStart] = useState('12:00');
  const [customEnd, setCustomEnd] = useState('16:00');
  const [customMemberId, setCustomMemberId] = useState('');
  const [customWeeks, setCustomWeeks] = useState(1);

  const [editing, setEditing] = useState<{
    clubDate: string;
    templateId: number | null;
    shiftId: number | null;
    memberId: string;
    repeatWeeks: number;
  } | null>(null);

  const weekEnd = addDays(weekStart, 6);

  const load = useCallback(async () => {
    setError('');
    try {
      const [boardRes, peopleRes, tplRes] = await Promise.all([
        api.get('/club/admin/host/board', { params: { from: weekStart, to: weekEnd } }),
        api.get('/club/admin/host/assignees'),
        api.get('/club/admin/host/templates'),
      ]);
      setDays(boardRes.data?.days || []);
      setTemplates(tplRes.data?.templates || []);
      setAssignees(peopleRes.data?.members || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load hosts'));
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 2500);
  };

  const activeTemplates = useMemo(
    () => templates.filter((t) => t.isActive).sort((a, b) => a.sortOrder - b.sortOrder || a.startTime.localeCompare(b.startTime)),
    [templates],
  );

  const saveTemplate = async () => {
    try {
      await api.post('/club/admin/host/templates', {
        startTime: tplStart,
        endTime: tplEnd,
        label: tplLabel || null,
        sortOrder: activeTemplates.length,
      });
      setTplLabel('');
      flash('Slot added');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not add slot'));
    }
  };

  const removeTemplate = async (template: Template) => {
    try {
      await api.put(`/club/admin/host/templates/${template.id}`, { isActive: false });
      flash('Slot removed');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not remove slot'));
    }
  };

  const saveAssign = async () => {
    if (!editing) return;
    try {
      const memberId = editing.memberId === '' ? null : Number(editing.memberId);
      if (editing.shiftId && editing.repeatWeeks <= 1) {
        await api.post('/club/admin/host/assign', { shiftId: editing.shiftId, memberId });
      } else if (editing.templateId) {
        await api.post('/club/admin/host/assign', {
          clubDate: editing.clubDate,
          templateId: editing.templateId,
          memberId,
          repeatWeeks: editing.repeatWeeks,
        });
      } else if (editing.shiftId) {
        await api.post('/club/admin/host/assign', { shiftId: editing.shiftId, memberId });
      }
      setEditing(null);
      flash('Host saved');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not assign host'));
    }
  };

  const saveCustom = async () => {
    try {
      await api.post('/club/admin/host/custom', {
        clubDate: customDate,
        startTime: customStart,
        endTime: customEnd,
        memberId: customMemberId === '' ? null : Number(customMemberId),
        repeatWeeks: customWeeks,
      });
      flash('Custom slot saved');
      await load();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not create custom slot'));
    }
  };

  const slotFor = (day: BoardDay, templateId: number): HostBoardSlot | undefined =>
    day.slots.find((s) => s.templateId === templateId);

  const customsFor = (day: BoardDay): HostBoardSlot[] => day.slots.filter((s) => s.custom);

  if (loading) return <div style={{ padding: '16px', color: '#666' }}>Loading hosts…</div>;

  return (
    <div style={{ padding: '16px 18px 32px', maxWidth: '1100px' }}>
      <h2 style={{ margin: '0 0 12px', color: '#2c3e50' }}>Hosts</h2>
      {error ? <div className="error-message" style={{ marginBottom: '10px' }}>{error}</div> : null}
      {message ? <div className="success-message" style={{ marginBottom: '10px' }}>{message}</div> : null}

      <section className="card" style={{ padding: '14px', marginBottom: '16px' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>Slot catalog</h3>
        <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#5d6d7e' }}>
          These ranges appear every day. Empty cells are allowed. Custom ranges can overlap catalog slots.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
          <input style={inputStyle} type="time" value={tplStart} onChange={(e) => setTplStart(e.target.value)} />
          <input style={inputStyle} type="time" value={tplEnd} onChange={(e) => setTplEnd(e.target.value)} />
          <input style={{ ...inputStyle, minWidth: '140px' }} placeholder="Label (optional)" value={tplLabel} onChange={(e) => setTplLabel(e.target.value)} />
          <button type="button" onClick={() => void saveTemplate()}>Add slot</button>
        </div>
        <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px' }}>
          {activeTemplates.map((t) => (
            <li key={t.id} style={{ marginBottom: '4px' }}>
              {t.label ? `${t.label} ` : ''}{t.startTime}–{t.endTime}
              {' '}
              <button type="button" onClick={() => void removeTemplate(t)} style={{ fontSize: '12px' }}>
                Remove
              </button>
            </li>
          ))}
          {activeTemplates.length === 0 ? <li>No catalog slots yet.</li> : null}
        </ul>
      </section>

      <section className="card" style={{ padding: '14px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Week of {weekStart}</h3>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))}>Previous</button>
            <button type="button" onClick={() => setWeekStart(startOfWeekMonday(clubTodayYmd()))}>This week</button>
            <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))}>Next</button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '13px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #d5dbe3' }}>Day</th>
                {activeTemplates.map((t) => (
                  <th key={t.id} style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #d5dbe3' }}>
                    {t.label || `${t.startTime}–${t.endTime}`}
                  </th>
                ))}
                <th style={{ textAlign: 'left', padding: '6px', borderBottom: '1px solid #d5dbe3' }}>Custom</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day.clubDate}>
                  <td style={{ padding: '6px', borderBottom: '1px solid #eef2f6', whiteSpace: 'nowrap' }}>
                    {weekdayLabel(day.clubDate)}
                  </td>
                  {activeTemplates.map((t) => {
                    const slot = slotFor(day, t.id);
                    const name = hostMemberName(slot?.member) || '—';
                    const granted = slot?.perkGrants?.[0];
                    return (
                      <td key={t.id} style={{ padding: '6px', borderBottom: '1px solid #eef2f6' }}>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              clubDate: day.clubDate,
                              templateId: t.id,
                              shiftId: slot?.shiftId ?? null,
                              memberId: slot?.member?.id ? String(slot.member.id) : '',
                              repeatWeeks: 1,
                            })
                          }
                          style={{
                            width: '100%',
                            textAlign: 'left',
                            padding: '6px 8px',
                            border: '1px solid #d5dbe3',
                            borderRadius: '6px',
                            background: slot?.member ? '#eaf7ef' : '#f8fbff',
                            color: '#1a2833',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: '#1a2833' }}>{name}</div>
                          <div style={{ fontSize: '11px', color: '#5d6d7e' }}>
                            {slot?.claimedAt ? 'claimed' : slot?.member ? 'not claimed' : 'empty'}
                            {granted ? ` · ${granted.status.toLowerCase()}` : ''}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                  <td style={{ padding: '6px', borderBottom: '1px solid #eef2f6' }}>
                    {customsFor(day).map((slot) => (
                      <button
                        key={slot.shiftId || slot.startTime}
                        type="button"
                        onClick={() =>
                          setEditing({
                            clubDate: day.clubDate,
                            templateId: null,
                            shiftId: slot.shiftId,
                            memberId: slot.member?.id ? String(slot.member.id) : '',
                            repeatWeeks: 1,
                          })
                        }
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          marginBottom: '4px',
                          padding: '6px 8px',
                          border: '1px dashed #b9c7d8',
                          borderRadius: '6px',
                          background: '#fff8e8',
                          color: '#1a2833',
                          cursor: 'pointer',
                        }}
                      >
                        {hostSlotCaption(slot)}
                        <div style={{ fontWeight: 600, color: '#1a2833' }}>{hostMemberName(slot.member) || '—'}</div>
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" style={{ padding: '14px' }}>
        <h3 style={{ margin: '0 0 10px', fontSize: '15px' }}>Custom time range</h3>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <input style={inputStyle} type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
          <input style={inputStyle} type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
          <input style={inputStyle} type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          <AssigneePicker
            assignees={assignees}
            value={customMemberId}
            onChange={setCustomMemberId}
          />
          <label style={{ fontSize: '13px' }}>
            Repeat weeks{' '}
            <input
              style={{ ...inputStyle, width: '64px' }}
              type="number"
              min={1}
              value={customWeeks}
              onChange={(e) => setCustomWeeks(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
          <button type="button" onClick={() => void saveCustom()}>Add custom</button>
        </div>
      </section>

      {editing ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
          }}
          onClick={() => setEditing(null)}
        >
          <div
            className="card"
            style={{ padding: '16px', minWidth: '320px', maxWidth: '90vw', overflow: 'visible' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px' }}>Assign host · {editing.clubDate}</h3>
            <div style={{ marginBottom: '10px' }}>
              <AssigneePicker
                key={`${editing.clubDate}-${editing.shiftId}-${editing.templateId}`}
                assignees={assignees}
                value={editing.memberId}
                onChange={(memberId) => setEditing({ ...editing, memberId })}
                fullWidth
                expanded
              />
            </div>
            {editing.templateId ? (
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '10px' }}>
                Repeat weeks (fills empty cells only after the first)
                <input
                  style={{ ...inputStyle, width: '72px', marginLeft: '8px' }}
                  type="number"
                  min={1}
                  value={editing.repeatWeeks}
                  onChange={(e) => setEditing({ ...editing, repeatWeeks: Math.max(1, Number(e.target.value) || 1) })}
                />
              </label>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" onClick={() => void saveAssign()}>Save</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
