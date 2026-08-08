import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isAdmin } from '../utils/auth';
import {
  loadAdminSystemConfig,
  saveAdminSystemConfig,
  SystemConfig,
} from '../utils/systemConfig';
import { getErrorMessage } from '../utils/errorHandler';
import ClubPlanManager from './ClubPlanManager';
import { CourtesyVisitsAdmin } from './CourtesyVisitsAdmin';
import { PaymentsMemberLookup } from './PaymentsMemberLookup';
import { BoundedNumericInput } from './BoundedNumericInput';
import api from '../utils/api';

type PaymentsTab = 'plans' | 'payments';

type NumericInputProps = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

function NumericInput({ label, value, min = 0, max, onChange }: NumericInputProps) {
  return (
    <FieldRow label={label}>
      <BoundedNumericInput
        value={value}
        min={min}
        max={max}
        allowEmpty={false}
        aria-label={label}
        onChange={(next) => onChange(next ?? min)}
        inputStyle={valueInputStyle}
      />
    </FieldRow>
  );
}

const valueInputStyle = {
  width: '100%',
  padding: '9px 11px',
  border: '1px solid #b9c7d8',
  borderRadius: '6px',
  backgroundColor: '#f8fbff',
  color: '#17324d',
  fontWeight: 600,
} as const;

function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 32%) 1fr',
      gap: '18px',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid #edf1f5',
    }}>
      <div style={{
        color: '#2d6f8f',
        fontWeight: 700,
        letterSpacing: '0.01em',
      }}>
        {label}
      </div>
      <div style={{ color: '#17324d' }}>
        {children}
      </div>
    </div>
  );
}

function Subsection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{
      marginTop: '14px',
      border: '1px solid #e1ebf2',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: '#ffffff',
    }}>
      <h4 style={{
        margin: 0,
        padding: '10px 14px',
        backgroundColor: '#f2f8fb',
        color: '#3c7890',
        fontSize: '14px',
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        borderBottom: '1px solid #e1ebf2',
      }}>
        {title}
      </h4>
      <div style={{ padding: '0 14px' }}>
        {children}
      </div>
    </div>
  );
}

const PREDEFINED_SEGMENTS = [
  'Senior',
  'Junior',
  'Child',
  'Corporate',
];

function SegmentEditor({
  segments,
  onChange,
}: {
  segments: string[];
  onChange: (segs: string[]) => void;
}) {
  const [selectedChoice, setSelectedChoice] = useState('');
  const [customInput, setCustomInput] = useState('');
  const selectRef = useRef<HTMLSelectElement>(null);

  const available = PREDEFINED_SEGMENTS.filter((p) => !segments.includes(p));

  function addSegment() {
    const name = (selectedChoice === '__custom__' ? customInput : selectedChoice).trim();
    if (!name || segments.includes(name)) return;
    onChange([...segments, name]);
    setSelectedChoice('');
    setCustomInput('');
  }

  function removeSegment(name: string) {
    if (name === 'Regular') return; // Regular is always required
    onChange(segments.filter((c) => c !== name));
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: segments.length ? '12px' : 0 }}>
        {segments.map((seg) => (
          <span
            key={seg}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '4px 10px',
              borderRadius: '16px',
              background: '#eaf2f8',
              color: '#2c3e50',
              fontWeight: 600,
              fontSize: '13px',
              border: '1px solid #b8d4e8',
            }}
          >
            {seg}
            {seg !== 'Regular' && (
              <button
                type="button"
                onClick={() => removeSegment(seg)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '0 2px',
                  color: '#c0392b',
                  fontWeight: 700,
                  fontSize: '14px',
                  lineHeight: 1,
                }}
                title={`Remove ${seg}`}
              >×</button>
            )}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
          ref={selectRef}
          value={selectedChoice}
          onChange={(e) => setSelectedChoice(e.target.value)}
          style={{ ...valueInputStyle, flex: 1 }}
        >
          <option value="">— Select a segment —</option>
          {available.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
        {selectedChoice === '__custom__' && (
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addSegment()}
            placeholder="Segment name"
            style={{ ...valueInputStyle, flex: 1 }}
          />
        )}
        <button
          type="button"
          onClick={addSegment}
          disabled={!selectedChoice || (selectedChoice === '__custom__' && !customInput.trim())}
          style={{
            padding: '8px 16px',
            background: '#2980b9',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 700,
            cursor: 'pointer',
            opacity: (!selectedChoice || (selectedChoice === '__custom__' && !customInput.trim())) ? 0.5 : 1,
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

function PaymentsSettingsEditor({
  config,
  updateConfig,
}: {
  config: SystemConfig;
  updateConfig: (updater: (draft: SystemConfig) => void) => void;
}) {
  const payments = config.payments;
  const [providers, setProviders] = useState<
    Array<{
      id: string;
      displayName: string;
      usable: boolean;
      offered: boolean;
      environment?: 'testing' | 'production';
      assignableToMembers?: boolean;
      settingsSchema?: Array<{
        key: string;
        label: string;
        type: 'number' | 'string' | 'boolean';
        min?: number;
        hint?: string;
      }>;
      settings?: Record<string, unknown>;
    }>
  >([]);
  const [installMode, setInstallMode] = useState<'test' | 'production'>(
    payments.installMode === 'production' ? 'production' : 'test',
  );
  const [configureProviderId, setConfigureProviderId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/payments/providers')
      .then((res) => {
        setProviders(Array.isArray(res.data?.providers) ? res.data.providers : []);
        if (res.data?.installMode === 'production' || res.data?.installMode === 'test') {
          setInstallMode(res.data.installMode);
        }
      })
      .catch(() => setProviders([]));
  }, []);

  useEffect(() => {
    if (!payments.providers) {
      updateConfig((draft) => {
        draft.payments.providers = {
          dummy: { confirmDelayMeanMs: 2500, confirmDelayStdDevMs: 800 },
        };
      });
    }
  }, [payments.providers, updateConfig]);

  const assignableOnline = providers.filter((p) => p.assignableToMembers);
  const configurableOnline = providers.filter((p) => p.usable && p.offered && p.id !== 'cash');
  const configuring = configureProviderId
    ? providers.find((p) => p.id === configureProviderId)
    : null;

  if (configuring) {
    const schema = configuring.settingsSchema || [];
    const providerSettings =
      (payments.providers?.[configuring.id] as Record<string, unknown> | undefined) ||
      configuring.settings ||
      {};

    return (
      <div>
        <button
          type="button"
          onClick={() => setConfigureProviderId(null)}
          style={{ marginBottom: '12px' }}
        >
          ← Back to payment settings
        </button>
        <h4 style={{ margin: '0 0 8px' }}>Configure {configuring.displayName}</h4>
        {schema.length === 0 && (
          <p style={{ color: '#666', fontSize: '13px' }}>No settings for this provider.</p>
        )}
        {schema.map((field) => {
          if (field.type === 'number') {
            return (
              <NumericInput
                key={field.key}
                label={field.label}
                min={field.min ?? 0}
                value={Number(providerSettings[field.key]) || 0}
                onChange={(value) =>
                  updateConfig((draft) => {
                    if (!draft.payments.providers) {
                      draft.payments.providers = {
                        dummy: { confirmDelayMeanMs: 2500, confirmDelayStdDevMs: 800 },
                      };
                    }
                    draft.payments.providers[configuring.id] = {
                      ...(draft.payments.providers[configuring.id] || {}),
                      [field.key]: value,
                    };
                  })
                }
              />
            );
          }
          return (
            <FieldRow key={field.key} label={field.label}>
              <input
                type="text"
                value={String(providerSettings[field.key] ?? '')}
                onChange={(e) =>
                  updateConfig((draft) => {
                    if (!draft.payments.providers) {
                      draft.payments.providers = {
                        dummy: { confirmDelayMeanMs: 2500, confirmDelayStdDevMs: 800 },
                      };
                    }
                    draft.payments.providers[configuring.id] = {
                      ...(draft.payments.providers[configuring.id] || {}),
                      [field.key]: e.target.value,
                    };
                  })
                }
                style={valueInputStyle}
              />
            </FieldRow>
          );
        })}
        {schema.some((f) => f.hint) && (
          <p style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
            {schema
              .filter((f) => f.hint)
              .map((f) => f.hint)
              .join(' · ')}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <p style={{ margin: '0 0 12px', color: '#666', fontSize: '13px' }}>
        Online payment services are assigned per member in Player Settings. Cash remains a separate
        desk path. Which services Admin may assign is fixed by this install&apos;s payments mode.
      </p>
      <FieldRow label="Payments install mode">
        <div>
          <strong>{installMode === 'production' ? 'Production' : 'Test'}</strong>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#666' }}>
            Set once at database initialization (PAYMENTS_INSTALL_MODE or --payments-install-mode).
            Not editable here.
          </p>
        </div>
      </FieldRow>
      <FieldRow label="Available Payment services">
        <div style={{ fontSize: '14px' }}>
          {assignableOnline.length === 0
            ? 'None usable for this install mode'
            : assignableOnline.map((p) => p.displayName).join(', ')}
        </div>
      </FieldRow>
      <FieldRow label="Default online pay consent (new members)">
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={payments.defaultOnlinePayConsent === true}
            onChange={(e) =>
              updateConfig((draft) => {
                draft.payments.defaultOnlinePayConsent = e.target.checked;
              })
            }
          />
          New members with email start with online-pay consent on
        </label>
      </FieldRow>
      <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#666' }}>
        Consent is OFF by default. Members need email, an assigned payment service, and consent for
        Pay online.
      </p>

      {configurableOnline.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
          {configurableOnline.map((p) => (
            <button key={p.id} type="button" onClick={() => setConfigureProviderId(p.id)}>
              Configure {p.displayName}
            </button>
          ))}
        </div>
      )}

      <NumericInput
        label="New member trial days (0 = no trial)"
        min={0}
        value={payments.newMemberTrialDays}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.payments.newMemberTrialDays = value;
          })
        }
      />
      <NumericInput
        label="Courtesy grace days (period plans)"
        min={0}
        value={payments.courtesyGraceDays}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.payments.courtesyGraceDays = value;
          })
        }
      />
      <NumericInput
        label="Courtesy extra visits (visit packs)"
        min={0}
        value={payments.courtesyExtraVisits}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.payments.courtesyExtraVisits = value;
          })
        }
      />

      <FieldRow label="Notify admins on courtesy">
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
          <input
            type="checkbox"
            checked={payments.notifyAdminsOnCourtesy}
            onChange={(e) =>
              updateConfig((draft) => {
                draft.payments.notifyAdminsOnCourtesy = e.target.checked;
              })
            }
          />
          Email designated administrators
        </label>
      </FieldRow>
      <FieldRow label="Admin notify emails (one or more, comma-separated)">
        <input
          type="text"
          value={payments.adminNotifyEmails.join(', ')}
          onChange={(e) =>
            updateConfig((draft) => {
              draft.payments.adminNotifyEmails = e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            })
          }
          style={valueInputStyle}
          placeholder="admin@club.example"
        />
      </FieldRow>

      <h4 style={{ margin: '16px 0 8px' }}>Reminders</h4>
      <FieldRow label="Check-in banner reminders">
        <input
          type="checkbox"
          checked={payments.reminders.checkInBannerEnabled}
          onChange={(e) =>
            updateConfig((draft) => {
              draft.payments.reminders.checkInBannerEnabled = e.target.checked;
            })
          }
        />
      </FieldRow>
      <FieldRow label="Preemptive reminder emails">
        <input
          type="checkbox"
          checked={payments.reminders.emailEnabled}
          onChange={(e) =>
            updateConfig((draft) => {
              draft.payments.reminders.emailEnabled = e.target.checked;
            })
          }
        />
      </FieldRow>
      <NumericInput
        label="Days before period expiry (reminder)"
        min={0}
        value={payments.reminders.periodDaysBeforeExpiry}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.payments.reminders.periodDaysBeforeExpiry = value;
          })
        }
      />
      <NumericInput
        label="Visit pack visits remaining (reminder)"
        min={0}
        value={payments.reminders.visitPackVisitsRemaining}
        onChange={(value) =>
          updateConfig((draft) => {
            draft.payments.reminders.visitPackVisitsRemaining = value;
          })
        }
      />
    </div>
  );
}

export default function PaymentsAdmin() {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: PaymentsTab = tabParam === 'plans' ? 'plans' : 'payments';
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isAdmin()) {
      setLoading(false);
      return;
    }
    loadAdminSystemConfig()
      .then((loaded) => {
        if (!cancelled) {
          setConfig(loaded);
          setDirty(false);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load payments settings'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateConfig = (updater: (draft: SystemConfig) => void) => {
    setConfig((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      updater(draft);
      return draft;
    });
    setDirty(true);
    setMessage('');
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveAdminSystemConfig({
        payments: config.payments,
        clubPlans: config.clubPlans,
      });
      setConfig(saved);
      setDirty(false);
      setMessage('Payments settings saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save payments settings'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin()) {
    return <div className="card">Administrator access is required to manage payments.</div>;
  }

  if (loading) {
    return <div className="card">Loading payments…</div>;
  }

  if (!config) {
    return <div className="card error-message">{error || 'Payments settings are unavailable'}</div>;
  }

  const showSaveBar = tab === 'plans' && dirty;

  return (
    <div style={{ paddingBottom: showSaveBar ? '88px' : '16px' }}>
      {tab === 'plans' ? (
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ margin: 0 }}>Payment Plans</h2>
          <p style={{ margin: '6px 0 0', color: '#666' }}>
            Configure segments, club plans, courtesy settings, and related payment options.
          </p>
        </div>
      ) : (
        <div style={{ marginBottom: '16px' }}>
          <h2
            style={{ margin: 0, display: 'inline-block', cursor: 'help' }}
            title="All club payments, newest first. Filter by member, date, or Paid/Pending."
          >
            Payment Log
          </h2>
        </div>
      )}

      {error ? <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div> : null}
      {message && tab === 'plans' ? (
        <div className="success-message" style={{ marginBottom: '16px' }}>{message}</div>
      ) : null}

      {tab === 'plans' ? (
        <>
          <Subsection title="Segments">
            <p style={{ margin: '8px 0', color: '#666', fontSize: '13px' }}>
              Segments assigned to members that determine which plan price is charged. &quot;Regular&quot; is always required and used as the default fallback.
            </p>
            <SegmentEditor
              segments={config.clubPlans?.segments ?? ['Regular']}
              onChange={(segs) => updateConfig(draft => { draft.clubPlans.segments = segs; })}
            />
          </Subsection>

          <Subsection title="Club Payment Plans">
            <ClubPlanManager />
          </Subsection>

          <Subsection title="Payment Provider & Courtesy Settings">
            <PaymentsSettingsEditor config={config} updateConfig={updateConfig} />
          </Subsection>

          <Subsection title="Courtesy Visits">
            <CourtesyVisitsAdmin />
          </Subsection>
        </>
      ) : (
        <PaymentsMemberLookup />
      )}

      {showSaveBar ? (
        <div
          style={{
            position: 'fixed',
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 50,
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.96)',
            borderTop: '1px solid #d8e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
          }}
        >
          <button type="button" className="success" disabled={saving} onClick={() => void handleSave()}>
            {saving ? 'Saving…' : 'Save Payments Settings'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
