import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { isAdmin } from '../utils/auth';
import api from '../utils/api';
import { formatClubDateTime } from '../utils/clubDateTime';
import { getErrorMessage } from '../utils/errorHandler';

type LifecycleAction =
  | 'APPLY'
  | 'APPLY_RESEND'
  | 'ACTIVATE'
  | 'DEACTIVATE'
  | 'DENY'
  | 'DELETE';

type MembershipEventRow = {
  id: number;
  occurredAt: string;
  action: LifecycleAction;
  summary: string;
  memberId: number;
  memberName: string | null;
  actorType: 'PUBLIC' | 'ADMIN' | 'SYSTEM';
  actorName: string | null;
  details?: unknown;
};

const ALL_ACTIONS: LifecycleAction[] = [
  'APPLY',
  'APPLY_RESEND',
  'ACTIVATE',
  'DEACTIVATE',
  'DENY',
  'DELETE',
];

const ACTION_LABELS: Record<LifecycleAction, string> = {
  APPLY: 'Apply',
  APPLY_RESEND: 'Resend',
  ACTIVATE: 'Activate',
  DEACTIVATE: 'Deactivate',
  DENY: 'Deny',
  DELETE: 'Delete',
};

const MEMBERSHIP_ACTION_FILTER_KEY = 'membershipLog_actions';

function loadStickyActions(): Set<LifecycleAction> {
  try {
    const raw = localStorage.getItem(MEMBERSHIP_ACTION_FILTER_KEY);
    if (!raw) return new Set(ALL_ACTIONS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set(ALL_ACTIONS);
    const valid = parsed.filter((s): s is LifecycleAction =>
      ALL_ACTIONS.includes(s as LifecycleAction),
    );
    if (valid.length === 0) return new Set(ALL_ACTIONS);
    return new Set(valid);
  } catch {
    return new Set(ALL_ACTIONS);
  }
}

function saveStickyActions(selected: Set<LifecycleAction>) {
  try {
    localStorage.setItem(
      MEMBERSHIP_ACTION_FILTER_KEY,
      JSON.stringify(ALL_ACTIONS.filter((s) => selected.has(s))),
    );
  } catch {
    // localStorage may be unavailable
  }
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  fontSize: '10px',
  fontWeight: 700,
  color: '#3c7890',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  borderBottom: '1px solid #d8e8f0',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '3px 8px',
  borderBottom: '1px solid #eee',
  fontSize: '12px',
  color: '#17324d',
  verticalAlign: 'middle',
  lineHeight: 1.25,
  whiteSpace: 'nowrap',
};

const dateInputStyle: CSSProperties = {
  padding: '9px 11px',
  border: '1px solid #b9c7d8',
  borderRadius: '6px',
  backgroundColor: '#f8fbff',
  color: '#17324d',
  fontWeight: 600,
};

function formatWhen(iso: string | null): string {
  if (!iso) return '—';
  const formatted = formatClubDateTime(iso);
  return formatted === '—' ? iso : formatted;
}

export default function MembershipLogAdmin() {
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [actionSelected, setActionSelected] = useState<Set<LifecycleAction>>(loadStickyActions);
  const [events, setEvents] = useState<MembershipEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!isAdmin()) {
      setLoading(false);
      setError('Admin access required');
      return;
    }

    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      const q = memberFilter.trim();
      const params: Record<string, string> = {};
      if (q) params.q = q;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      const selectedList = ALL_ACTIONS.filter((a) => actionSelected.has(a));
      if (selectedList.length === 1) {
        params.action = selectedList[0];
      }

      api
        .get('/club/admin/membership-events', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          const rows: MembershipEventRow[] = Array.isArray(res.data?.events)
            ? res.data.events
            : [];
          setEvents(rows.filter((e) => actionSelected.has(e.action)));
          setError('');
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setEvents([]);
          setError(getErrorMessage(err, 'Failed to load membership log'));
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, memberFilter.trim() ? 250 : 0);

    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [memberFilter, dateFrom, dateTo, actionSelected]);

  if (!isAdmin()) {
    return <div className="card error-message">Admin access required</div>;
  }

  const allActionsSelected = ALL_ACTIONS.every((a) => actionSelected.has(a));
  const filtersActive = Boolean(memberFilter.trim() || dateFrom || dateTo || !allActionsSelected);

  const toggleAction = (value: LifecycleAction) => {
    setActionSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        if (next.size <= 1) return prev;
        next.delete(value);
      } else {
        next.add(value);
      }
      saveStickyActions(next);
      return next;
    });
  };

  return (
    <div style={{ paddingBottom: '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2
          style={{ margin: 0, display: 'inline-block', cursor: 'help' }}
          title="Membership lifecycle history (apply, activate, deny, deactivate, delete). Newest first."
        >
          Membership Log
        </h2>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px 24px',
          alignItems: 'flex-end',
          marginBottom: '4px',
        }}
      >
        <div style={{ flex: '0 1 200px', maxWidth: '200px' }}>
          <label
            htmlFor="membership-member-filter"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            Member
          </label>
          <input
            id="membership-member-filter"
            type="search"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder="Filter by name or email…"
            aria-label="Filter membership log by member name or email"
            style={{
              width: '100%',
              padding: '9px 11px',
              border: '1px solid #b9c7d8',
              borderRadius: '6px',
              backgroundColor: '#f8fbff',
              color: '#17324d',
              fontWeight: 600,
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div>
          <label
            htmlFor="membership-date-from"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            From
          </label>
          <input
            id="membership-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Filter membership log from date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <label
            htmlFor="membership-date-to"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            To
          </label>
          <input
            id="membership-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Filter membership log to date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <div style={{ margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}>
            Action
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 10px' }}>
            {ALL_ACTIONS.map((action) => {
              const checked = actionSelected.has(action);
              return (
                <label
                  key={action}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#17324d',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAction(action)}
                  />
                  {ACTION_LABELS[action]}
                </label>
              );
            })}
          </div>
        </div>
        {filtersActive ? (
          <button
            type="button"
            onClick={() => {
              setMemberFilter('');
              setDateFrom('');
              setDateTo('');
              const all = new Set(ALL_ACTIONS);
              saveStickyActions(all);
              setActionSelected(all);
            }}
            style={{
              padding: '8px 12px',
              border: '1px solid #b9c7d8',
              borderRadius: '6px',
              background: '#fff',
              color: '#17324d',
              fontWeight: 600,
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="card error-message" style={{ marginTop: '12px' }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: '12px', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '720px' }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Member</th>
              <th style={thStyle}>Action</th>
              <th style={thStyle}>Actor</th>
              <th style={thStyle}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: '#7f8c8d' }}>
                  Loading…
                </td>
              </tr>
            ) : events.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...tdStyle, color: '#7f8c8d' }}>
                  No membership events found.
                </td>
              </tr>
            ) : (
              events.map((row) => (
                <tr key={row.id}>
                  <td style={tdStyle}>{formatWhen(row.occurredAt)}</td>
                  <td style={tdStyle}>{row.memberName || `Member #${row.memberId}`}</td>
                  <td style={tdStyle}>{ACTION_LABELS[row.action] || row.action}</td>
                  <td style={tdStyle}>{row.actorName || row.actorType}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'normal', maxWidth: '360px' }}>
                    {row.summary}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
