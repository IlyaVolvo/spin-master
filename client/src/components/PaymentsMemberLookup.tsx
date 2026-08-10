import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import api from '../utils/api';
import { formatClubDateTime, formatYmd } from '../utils/clubDateTime';
import { getErrorMessage } from '../utils/errorHandler';
import { connectSocket, getSocket } from '../utils/socket';
import { MemberPlanScreen } from './players/MemberPlanScreen';

type PaymentRow = {
  id: number;
  kind?: 'payment';
  memberId: number;
  memberName: string;
  amountCents: number;
  listAmountCents: number;
  creditAppliedCents: number;
  purpose: string;
  planLabel: string | null;
  effectiveDate?: string | null;
  provider: string;
  status: string;
  recordedAt: string;
};

type CreditRow = {
  id: number;
  kind: 'credit';
  memberId: number;
  memberName: string;
  amountCents: number;
  reason: string;
  issuerMemberId: number | null;
  issuerName: string | null;
  externalRef: string | null;
  recordedAt: string;
};

type LogRow =
  | (PaymentRow & { kind: 'payment' })
  | CreditRow;

type PaymentsMemberLookupProps = {
  /** When set, opens that member’s plan screen once */
  openMemberId?: number | null;
  onOpenMemberConsumed?: () => void;
};

type ProviderOption = { id: string; displayName: string };
type ProviderSelection = { mode: 'all' } | { mode: 'subset'; ids: Set<string> };

const PAYMENT_STATUSES = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'WRITTEN_OFF',
] as const;
type PaymentStatusFilter = (typeof PAYMENT_STATUSES)[number];

const FILTER_ALL = 'all';
const STATUS_FILTER_KEY = 'paymentLog_statuses';
const PROVIDER_FILTER_KEY = 'paymentLog_providers';
/** Legacy single-value keys (migrated on read). */
const STATUS_FILTER_KEY_LEGACY = 'paymentLog_status';
const PROVIDER_FILTER_KEY_LEGACY = 'paymentLog_provider';

const STATUS_LABELS: Record<PaymentStatusFilter, string> = {
  PENDING: 'Pending',
  SUCCEEDED: 'Paid',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
  WRITTEN_OFF: 'Written off',
};

function isPaymentStatus(value: string): value is PaymentStatusFilter {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

function allStatusesSet(): Set<PaymentStatusFilter> {
  return new Set(PAYMENT_STATUSES);
}

function loadStickyStatuses(): Set<PaymentStatusFilter> {
  try {
    const raw = localStorage.getItem(STATUS_FILTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.includes(FILTER_ALL) || parsed.length === 0) return allStatusesSet();
        const valid = parsed.filter((s): s is PaymentStatusFilter => isPaymentStatus(String(s)));
        if (valid.length === 0) return allStatusesSet();
        return new Set(valid);
      }
    }
    const legacy = localStorage.getItem(STATUS_FILTER_KEY_LEGACY);
    if (!legacy || legacy === FILTER_ALL) return allStatusesSet();
    if (isPaymentStatus(legacy)) return new Set([legacy]);
  } catch {
    // localStorage may be unavailable
  }
  return allStatusesSet();
}

function loadStickyProviders(): ProviderSelection {
  try {
    const raw = localStorage.getItem(PROVIDER_FILTER_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        if (parsed.includes(FILTER_ALL) || parsed.includes('*') || parsed.length === 0) {
          return { mode: 'all' };
        }
        const ids = parsed.map(String).filter(Boolean);
        if (ids.length === 0) return { mode: 'all' };
        return { mode: 'subset', ids: new Set(ids) };
      }
    }
    const legacy = localStorage.getItem(PROVIDER_FILTER_KEY_LEGACY);
    if (!legacy || legacy === FILTER_ALL) return { mode: 'all' };
    return { mode: 'subset', ids: new Set([legacy]) };
  } catch {
    return { mode: 'all' };
  }
}

function saveStickyJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable
  }
}

function formatMoney(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`;
}

const dateInputStyle: CSSProperties = {
  padding: '9px 11px',
  border: '1px solid #b9c7d8',
  borderRadius: '6px',
  backgroundColor: '#f8fbff',
  color: '#17324d',
  fontWeight: 600,
};

type MultiFilterOption = { value: string; label: string };

/** One-line dropdown trigger; checkboxes inside; summary of selection below. */
function MultiFilterDropdown({
  id,
  label,
  options,
  selectedValues,
  allSelected,
  summaryText,
  onToggleAll,
  onToggleValue,
}: {
  id: string;
  label: string;
  options: MultiFilterOption[];
  selectedValues: Set<string>;
  allSelected: boolean;
  summaryText: string;
  onToggleAll: () => void;
  onToggleValue: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ minWidth: '160px' }}>
      <label
        htmlFor={id}
        style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{
            ...dateInputStyle,
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            cursor: 'pointer',
            textAlign: 'left',
            fontWeight: 600,
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {allSelected ? 'All' : `${selectedValues.size} selected`}
          </span>
          <span aria-hidden style={{ color: '#5a7a90', fontSize: '11px' }}>
            {open ? '▲' : '▼'}
          </span>
        </button>
        {open ? (
          <div
            role="listbox"
            aria-multiselectable
            aria-label={label}
            style={{
              position: 'absolute',
              zIndex: 20,
              top: 'calc(100% + 2px)',
              left: 0,
              minWidth: '100%',
              maxHeight: '240px',
              overflowY: 'auto',
              padding: '6px 0',
              border: '1px solid #b9c7d8',
              borderRadius: '6px',
              backgroundColor: '#fff',
              boxShadow: '0 6px 18px rgba(23, 50, 77, 0.12)',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: 600,
                color: '#17324d',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleAll}
                aria-label={`Select all ${label.toLowerCase()}`}
              />
              All
            </label>
            <div style={{ height: '1px', background: '#e8eef3', margin: '4px 0' }} />
            {options.map((opt) => {
              const checked = allSelected || selectedValues.has(opt.value);
              return (
                <label
                  key={opt.value}
                  role="option"
                  aria-selected={checked}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: '#17324d',
                    cursor: 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleValue(opt.value)}
                    aria-label={opt.label}
                  />
                  {opt.label}
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
      <div
        style={{
          marginTop: '4px',
          fontSize: '12px',
          color: '#5a6a7a',
          lineHeight: 1.35,
          maxWidth: '220px',
        }}
      >
        {summaryText}
      </div>
    </div>
  );
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 8px',
  fontSize: '11px',
  fontWeight: 700,
  color: '#3c7890',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  borderBottom: '1px solid #d8e8f0',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = {
  padding: '8px',
  borderBottom: '1px solid #eee',
  fontSize: '13px',
  color: '#17324d',
  verticalAlign: 'top',
  lineHeight: 1.35,
};

export function PaymentsMemberLookup({
  openMemberId = null,
  onOpenMemberConsumed,
}: PaymentsMemberLookupProps) {
  const [memberFilter, setMemberFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusSelected, setStatusSelected] = useState<Set<PaymentStatusFilter>>(loadStickyStatuses);
  const [providerSelected, setProviderSelected] = useState<ProviderSelection>(loadStickyProviders);
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [credits, setCredits] = useState<CreditRow[]>([]);
  const [showPayments, setShowPayments] = useState(true);
  const [showCredits, setShowCredits] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [writeOffTarget, setWriteOffTarget] = useState<PaymentRow | null>(null);
  const [writeOffName, setWriteOffName] = useState('');
  const [writeOffPassword, setWriteOffPassword] = useState('');
  const [writeOffBusy, setWriteOffBusy] = useState(false);
  const [writeOffError, setWriteOffError] = useState('');
  const debounceRef = useRef<number | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (openMemberId == null || !Number.isFinite(openMemberId)) return;
    setSelectedMemberId(openMemberId);
    onOpenMemberConsumed?.();
  }, [openMemberId, onOpenMemberConsumed]);

  useEffect(() => {
    api
      .get('/payments/providers')
      .then((res) => {
        const list = Array.isArray(res.data?.providers) ? res.data.providers : [];
        setProviderOptions(
          list
            .map((p: { id?: unknown; displayName?: unknown }) => ({
              id: String(p?.id ?? ''),
              displayName: String(p?.displayName || p?.id || ''),
            }))
            .filter((p: ProviderOption) => p.id),
        );
      })
      .catch(() => setProviderOptions([]));
  }, []);

  useEffect(() => {
    const all = PAYMENT_STATUSES.every((s) => statusSelected.has(s));
    saveStickyJson(
      STATUS_FILTER_KEY,
      all ? [FILTER_ALL] : PAYMENT_STATUSES.filter((s) => statusSelected.has(s)),
    );
  }, [statusSelected]);

  useEffect(() => {
    saveStickyJson(
      PROVIDER_FILTER_KEY,
      providerSelected.mode === 'all' ? [FILTER_ALL] : Array.from(providerSelected.ids),
    );
  }, [providerSelected]);

  const loadPayments = useCallback(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }

    setLoading(true);
    debounceRef.current = window.setTimeout(() => {
      const seq = ++requestSeq.current;
      const q = memberFilter.trim();
      let includePayments = showPayments;
      let includeCredits = showCredits;
      if (!includePayments && !includeCredits) {
        includePayments = true;
      }
      const params: Record<string, string> = {
        payments: includePayments ? '1' : '0',
        credits: includeCredits ? '1' : '0',
      };
      if (q) params.q = q;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;
      api
        .get('/club/admin/payments', { params })
        .then((res) => {
          if (seq !== requestSeq.current) return;
          setPayments(Array.isArray(res.data?.payments) ? res.data.payments : []);
          setCredits(Array.isArray(res.data?.credits) ? res.data.credits : []);
          setError('');
        })
        .catch((err) => {
          if (seq !== requestSeq.current) return;
          setPayments([]);
          setCredits([]);
          setError(getErrorMessage(err, 'Failed to load payments'));
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, memberFilter.trim() ? 250 : 0);
  }, [memberFilter, dateFrom, dateTo, showPayments, showCredits]);

  useEffect(() => {
    loadPayments();
    return () => {
      if (debounceRef.current != null) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [loadPayments]);

  useEffect(() => {
    connectSocket();
    const socket = getSocket();
    const onPaymentUpdated = () => {
      loadPayments();
    };
    socket?.on('payment:updated', onPaymentUpdated);
    return () => {
      socket?.off('payment:updated', onPaymentUpdated);
    };
  }, [loadPayments]);

  const providerSelectOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const p of providerOptions) {
      byId.set(p.id, p.displayName || p.id);
    }
    for (const row of payments) {
      if (row.provider && !byId.has(row.provider)) {
        byId.set(row.provider, row.provider);
      }
    }
    if (providerSelected.mode === 'subset') {
      for (const id of providerSelected.ids) {
        if (!byId.has(id)) byId.set(id, id);
      }
    }
    return Array.from(byId.entries())
      .map(([id, displayName]) => ({ id, displayName }))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [providerOptions, payments, providerSelected]);

  const allStatusesSelected = PAYMENT_STATUSES.every((s) => statusSelected.has(s));
  const allProvidersSelected = providerSelected.mode === 'all';

  const filteredRows = useMemo((): LogRow[] => {
    const paymentRows: LogRow[] = showPayments
      ? payments
          .filter((p) => {
            if (!allStatusesSelected && !statusSelected.has(p.status as PaymentStatusFilter)) {
              return false;
            }
            if (providerSelected.mode === 'subset' && !providerSelected.ids.has(p.provider)) {
              return false;
            }
            return true;
          })
          .map((p) => ({ ...p, kind: 'payment' as const }))
      : [];
    const creditRows: LogRow[] = showCredits
      ? credits.map((c) => ({ ...c, kind: 'credit' as const }))
      : [];
    return [...paymentRows, ...creditRows].sort(
      (a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt),
    );
  }, [
    payments,
    credits,
    showPayments,
    showCredits,
    statusSelected,
    providerSelected,
    allStatusesSelected,
  ]);

  const filtersActive =
    Boolean(memberFilter.trim()) ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    !allStatusesSelected ||
    !allProvidersSelected ||
    !showPayments ||
    !showCredits;

  const statusSummary = allStatusesSelected
    ? 'All'
    : PAYMENT_STATUSES.filter((s) => statusSelected.has(s))
        .map((s) => STATUS_LABELS[s])
        .join(', ');

  const providerSummary = allProvidersSelected
    ? 'All'
    : providerSelectOptions
        .filter((p) => providerSelected.mode === 'subset' && providerSelected.ids.has(p.id))
        .map((p) => p.displayName)
        .join(', ') ||
      (providerSelected.mode === 'subset' ? Array.from(providerSelected.ids).join(', ') : 'All');

  const toggleStatusAll = () => {
    setStatusSelected(allStatusesSet());
  };

  const toggleStatusValue = (value: string) => {
    if (!isPaymentStatus(value)) return;
    if (allStatusesSelected) {
      setStatusSelected(new Set([value]));
      return;
    }
    const next = new Set(statusSelected);
    if (next.has(value)) {
      if (next.size <= 1) return; // keep at least one
      next.delete(value);
    } else {
      next.add(value);
    }
    if (PAYMENT_STATUSES.every((s) => next.has(s))) {
      setStatusSelected(allStatusesSet());
      return;
    }
    setStatusSelected(next);
  };

  const toggleProviderAll = () => {
    setProviderSelected({ mode: 'all' });
  };

  const toggleProviderValue = (value: string) => {
    if (providerSelected.mode === 'all') {
      setProviderSelected({ mode: 'subset', ids: new Set([value]) });
      return;
    }
    const next = new Set(providerSelected.ids);
    if (next.has(value)) {
      if (next.size <= 1) return;
      next.delete(value);
    } else {
      next.add(value);
    }
    if (
      providerSelectOptions.length > 0 &&
      providerSelectOptions.every((p) => next.has(p.id))
    ) {
      setProviderSelected({ mode: 'all' });
      return;
    }
    setProviderSelected({ mode: 'subset', ids: next });
  };

  const clearPayment = async (id: number) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/club/admin/payments/${id}/clear`);
      loadPayments();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to clear payment'));
    } finally {
      setBusyId(null);
    }
  };

  const openWriteOff = (p: PaymentRow) => {
    setWriteOffTarget(p);
    setWriteOffName('');
    setWriteOffPassword('');
    setWriteOffError('');
  };

  const submitWriteOff = async () => {
    if (!writeOffTarget) return;
    setWriteOffBusy(true);
    setWriteOffError('');
    try {
      await api.post(`/club/admin/payments/${writeOffTarget.id}/write-off`, {
        memberNameConfirm: writeOffName,
        password: writeOffPassword,
      });
      setWriteOffTarget(null);
      setWriteOffName('');
      setWriteOffPassword('');
      loadPayments();
    } catch (err) {
      setWriteOffError(getErrorMessage(err, 'Failed to write off payment'));
    } finally {
      setWriteOffBusy(false);
    }
  };

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px 24px',
          alignItems: 'flex-start',
          marginBottom: '4px',
        }}
      >
        <div style={{ flex: '1 1 220px', maxWidth: '420px' }}>
          <label
            htmlFor="member-payments-filter"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            Member
          </label>
          <input
            id="member-payments-filter"
            type="search"
            value={memberFilter}
            onChange={(e) => setMemberFilter(e.target.value)}
            placeholder="Filter by member name…"
            aria-label="Filter payments by member name"
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
            htmlFor="payments-date-from"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            From
          </label>
          <input
            id="payments-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            aria-label="Filter payments from date"
            style={dateInputStyle}
          />
        </div>
        <div>
          <label
            htmlFor="payments-date-to"
            style={{ display: 'block', margin: '0 0 6px', fontSize: '13px', fontWeight: 700, color: '#2c3e50' }}
          >
            To
          </label>
          <input
            id="payments-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            aria-label="Filter payments to date"
            style={dateInputStyle}
          />
        </div>
        <MultiFilterDropdown
          id="payments-status-filter"
          label="Status"
          options={PAYMENT_STATUSES.map((status) => ({
            value: status,
            label: STATUS_LABELS[status],
          }))}
          selectedValues={statusSelected as Set<string>}
          allSelected={allStatusesSelected}
          summaryText={statusSummary}
          onToggleAll={toggleStatusAll}
          onToggleValue={toggleStatusValue}
        />
        <MultiFilterDropdown
          id="payments-provider-filter"
          label="Provider"
          options={providerSelectOptions.map((p) => ({
            value: p.id,
            label: p.displayName,
          }))}
          selectedValues={
            providerSelected.mode === 'all'
              ? new Set(providerSelectOptions.map((p) => p.id))
              : providerSelected.ids
          }
          allSelected={allProvidersSelected}
          summaryText={providerSummary}
          onToggleAll={toggleProviderAll}
          onToggleValue={toggleProviderValue}
        />
        <div>
          <div
            style={{
              display: 'block',
              margin: '0 0 6px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#2c3e50',
            }}
          >
            Type
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '14px',
              padding: '8px 10px',
              border: '1px solid #b9c7d8',
              borderRadius: '6px',
              backgroundColor: '#f8fbff',
              fontSize: '13px',
              minHeight: '38px',
              boxSizing: 'border-box',
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showPayments}
                onChange={() => {
                  setShowPayments((prev) => {
                    if (prev && !showCredits) return true;
                    return !prev;
                  });
                }}
              />
              Payment
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showCredits}
                onChange={() => {
                  setShowCredits((prev) => {
                    if (prev && !showPayments) return true;
                    return !prev;
                  });
                }}
              />
              Credit
            </label>
          </div>
        </div>
        <button
          type="button"
          onClick={() => loadPayments()}
          style={{ fontSize: '12px', marginTop: '28px' }}
        >
          Refresh
        </button>
      </div>

      {error ? <div className="error-message" style={{ marginTop: '8px' }}>{error}</div> : null}
      {loading ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#666' }}>Loading payments…</div>
      ) : null}
      {!loading && filteredRows.length === 0 && !error ? (
        <div style={{ marginTop: '8px', fontSize: '13px', color: '#888' }}>
          {filtersActive ? 'No entries matched the current filters.' : 'No payments or credits yet.'}
        </div>
      ) : null}

      {!loading && filteredRows.length > 0 ? (
        <div style={{ overflowX: 'auto', marginTop: '10px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '760px' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Member</th>
                <th style={thStyle}>Plan / purpose</th>
                <th style={thStyle}>Amount</th>
                <th style={thStyle}>Provider</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                if (row.kind === 'credit') {
                  return (
                    <tr key={`credit-${row.id}`}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>
                        {formatClubDateTime(row.recordedAt)}
                      </td>
                      <td style={tdStyle}>
                        <button
                          type="button"
                          onClick={() => setSelectedMemberId(row.memberId)}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            color: '#1a5276',
                            fontWeight: 700,
                            cursor: 'pointer',
                            textDecoration: 'underline',
                            textAlign: 'left',
                          }}
                        >
                          {row.memberName}
                        </button>
                        <span style={{ color: '#666', fontWeight: 500 }}> (#{row.memberId})</span>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>Credit</div>
                        <div style={{ color: '#666', fontSize: '12px' }}>
                          {row.reason?.trim() || '—'}
                          {row.issuerName
                            ? ` · by ${row.issuerName}`
                            : ' · system'}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap', color: '#1e7e34' }}>
                        +{formatMoney(row.amountCents)}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>credit</td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: '#1e7e34' }}>Credit</span>
                      </td>
                    </tr>
                  );
                }

                const p = row;
                const effective = formatYmd(p.effectiveDate);
                const isPending = p.status === 'PENDING';
                const isCashPending = isPending && p.provider === 'cash';
                return (
                  <tr key={`payment-${p.id}`}>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>
                      {formatClubDateTime(p.recordedAt)}
                    </td>
                    <td style={tdStyle}>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberId(p.memberId)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#1a5276',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          textAlign: 'left',
                        }}
                      >
                        {p.memberName}
                      </button>
                      <span style={{ color: '#666', fontWeight: 500 }}> (#{p.memberId})</span>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{p.planLabel || p.purpose || 'Payment'}</div>
                      {p.planLabel && p.purpose && p.purpose !== p.planLabel ? (
                        <div style={{ color: '#666', fontSize: '12px' }}>{p.purpose}</div>
                      ) : null}
                      {effective ? (
                        <div style={{ color: '#888', fontSize: '11px', marginTop: '2px' }}>
                          Effective {effective}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      {formatMoney(p.amountCents)}
                      {(p.creditAppliedCents ?? 0) > 0 ? (
                        <div style={{ color: '#666', fontSize: '11px', fontWeight: 500 }}>
                          list {formatMoney(p.listAmountCents ?? p.amountCents)} · credit{' '}
                          {formatMoney(p.creditAppliedCents)}
                        </div>
                      ) : null}
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#666' }}>{p.provider}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.status === 'SUCCEEDED' ? (
                        <span style={{ fontWeight: 700, color: '#17324d' }}>Paid</span>
                      ) : p.status === 'WRITTEN_OFF' ? (
                        <span style={{ fontWeight: 700, color: '#7f8c8d' }} title="Written off — not revivable">
                          Written off
                        </span>
                      ) : isPending ? (
                        <div style={{ display: 'inline-flex', flexDirection: 'row', gap: '6px', alignItems: 'center', justifyContent: 'flex-end' }}>
                          {isCashPending ? (
                            <button
                              type="button"
                              disabled={busyId === p.id}
                              onClick={() => void clearPayment(p.id)}
                              style={{ padding: '4px 10px', fontWeight: 600 }}
                            >
                              Clear
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={busyId === p.id || writeOffBusy}
                            onClick={() => openWriteOff(p)}
                            title="Write off this pending payment. No plan is granted. Requires member name + your password."
                            style={{ padding: '4px 10px' }}
                          >
                            Write off
                          </button>
                        </div>
                      ) : (
                        <span style={{ color: '#666' }}>{p.status}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {writeOffTarget ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="write-off-title"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={() => {
            if (!writeOffBusy) setWriteOffTarget(null);
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '22px 20px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 12px 40px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="write-off-title" style={{ margin: '0 0 8px', fontSize: '18px', color: '#2c3e50' }}>
              Write off pending payment
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#555', lineHeight: 1.45 }}>
              This marks the payment as <strong>Written off</strong> (not revivable). No plan is granted.
              If the charge later proves successful, add purchase credit on{' '}
              <strong>{writeOffTarget.memberName}</strong>&apos;s member plan.
            </p>
            <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#333' }}>
              {writeOffTarget.purpose || 'Payment'} · {formatMoney(writeOffTarget.amountCents)} ·{' '}
              {writeOffTarget.provider}
            </p>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Type member name to confirm
            </label>
            <input
              type="text"
              value={writeOffName}
              onChange={(e) => setWriteOffName(e.target.value)}
              placeholder={writeOffTarget.memberName}
              autoFocus
              disabled={writeOffBusy}
              style={{ width: '100%', padding: '9px 10px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
              Your admin password
            </label>
            <input
              type="password"
              value={writeOffPassword}
              onChange={(e) => setWriteOffPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitWriteOff();
                }
              }}
              disabled={writeOffBusy}
              style={{ width: '100%', padding: '9px 10px', marginBottom: '12px', boxSizing: 'border-box' }}
            />
            {writeOffError ? (
              <div className="error-message" style={{ marginBottom: '10px' }}>
                {writeOffError}
              </div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" disabled={writeOffBusy} onClick={() => setWriteOffTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={writeOffBusy || !writeOffName.trim() || !writeOffPassword}
                onClick={() => void submitWriteOff()}
                style={{ fontWeight: 700 }}
              >
                {writeOffBusy ? 'Writing off…' : 'Write off'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedMemberId != null ? (
        <MemberPlanScreen
          memberId={selectedMemberId}
          onClose={() => {
            setSelectedMemberId(null);
            loadPayments();
          }}
        />
      ) : null}
    </div>
  );
}
