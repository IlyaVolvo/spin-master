import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { isAdmin } from '../utils/auth';
import {
  ACHIEVEMENT_CATEGORY_IDS,
  ACHIEVEMENT_CATEGORY_LABELS,
  loadAdminSystemConfig,
  saveAdminSystemConfig,
  SystemConfig,
} from '../utils/systemConfig';
import { getErrorMessage } from '../utils/errorHandler';
import ClubPlanManager from './ClubPlanManager';
import { CourtesyVisitsAdmin } from './CourtesyVisitsAdmin';
import { BoundedNumericInput } from './BoundedNumericInput';
import api from '../utils/api';

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

function Section({
  title,
  sectionId,
  open,
  onToggle,
  children,
}: {
  title: string;
  sectionId: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <section className="card" style={{ marginBottom: '14px', padding: 0, overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => onToggle(sectionId)}
        aria-expanded={open}
        style={{
          width: '100%',
          margin: 0,
          padding: '14px 18px',
          background: 'linear-gradient(90deg, #eaf5fb, #f7fbfd)',
          color: '#155b78',
          border: 'none',
          borderBottom: open ? '1px solid #d8e8f0' : 'none',
          fontSize: '17px',
          fontWeight: 700,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '14px', opacity: 0.75 }} aria-hidden>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open ? <div style={{ padding: '4px 18px 8px' }}>{children}</div> : null}
    </section>
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

function ExpandableSubsection({
  title,
  subsectionId,
  open,
  onToggle,
  children,
}: {
  title: string;
  subsectionId: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div style={{
      marginTop: '14px',
      border: '1px solid #e1ebf2',
      borderRadius: '8px',
      overflow: 'hidden',
      backgroundColor: '#ffffff',
    }}>
      <button
        type="button"
        onClick={() => onToggle(subsectionId)}
        aria-expanded={open}
        style={{
          width: '100%',
          margin: 0,
          padding: '10px 14px',
          backgroundColor: '#f2f8fb',
          color: '#3c7890',
          border: 'none',
          borderBottom: open ? '1px solid #e1ebf2' : 'none',
          fontSize: '14px',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <span>{title}</span>
        <span style={{ fontSize: '12px', opacity: 0.75, textTransform: 'none', letterSpacing: 0 }} aria-hidden>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open ? <div style={{ padding: '0 14px' }}>{children}</div> : null}
    </div>
  );
}

const PREDEFINED_SEGMENTS = [
  'Senior',
  'Junior',
  'Child',
  'Trial',
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
    Array<{ id: string; displayName: string; usable: boolean; offered: boolean }>
  >([]);

  useEffect(() => {
    api
      .get('/payments/providers')
      .then((res) => {
        setProviders(Array.isArray(res.data?.providers) ? res.data.providers : []);
      })
      .catch(() => setProviders([]));
  }, []);

  const usableOffered = providers.filter((p) => p.usable && p.offered);
  const showProviderSelect = usableOffered.length > 1;

  return (
    <div>
      <p style={{ margin: '0 0 12px', color: '#666', fontSize: '13px' }}>
        One payment provider per install. If only one usable provider exists, it is used automatically.
      </p>
      {showProviderSelect ? (
        <FieldRow label="Active payment provider">
          <select
            value={payments.providerId}
            onChange={(e) =>
              updateConfig((draft) => {
                draft.payments.providerId = e.target.value;
              })
            }
            style={valueInputStyle}
          >
            <option value="">— Auto / select —</option>
            {usableOffered.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
        </FieldRow>
      ) : (
        <p style={{ fontSize: '14px', color: '#333' }}>
          Active provider:{' '}
          <strong>{usableOffered[0]?.displayName || payments.providerId || 'none'}</strong>
        </p>
      )}

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

export default function SystemSettings() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [achievementsSetAll, setAchievementsSetAll] = useState(10);
  const [dirty, setDirty] = useState(false);
  const [openSectionId, setOpenSectionId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('systemSettings_openSection') || 'core';
      // Migrate old section ids into the combined payment section
      if (
        saved === 'club' ||
        saved === 'payment-categories' ||
        saved === 'payment-plans' ||
        saved === 'payment-provider' ||
        saved === 'courtesy-visits'
      ) {
        return saved === 'club' ? 'core' : 'payment-plans-courtesy';
      }
      return saved;
    } catch {
      return 'core';
    }
  });
  const [openTournamentRuleId, setOpenTournamentRuleId] = useState<string | null>(null);

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
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load system settings'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSection = (id: string) => {
    setOpenSectionId((current) => {
      const next = current === id ? '' : id;
      try {
        localStorage.setItem('systemSettings_openSection', next);
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleTournamentRule = (id: string) => {
    setOpenTournamentRuleId((current) => (current === id ? null : id));
  };

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
      const saved = await saveAdminSystemConfig(config);
      setConfig(saved);
      setDirty(false);
      setMessage('System settings saved');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to save system settings'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin()) {
    return <div className="card">Administrator access is required to manage system settings.</div>;
  }

  if (loading) {
    return <div className="card">Loading system settings...</div>;
  }

  if (!config) {
    return <div className="card error-message">{error || 'System settings are unavailable'}</div>;
  }

  return (
    <div style={{ paddingBottom: dirty ? '88px' : '16px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>System Settings</h2>
        <p style={{ margin: '6px 0 0', color: '#666' }}>
          Open a section to edit. Use Save when your changes are ready.
        </p>
      </div>

      {error ? <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div> : null}
      {message ? <div className="success-message" style={{ marginBottom: '16px' }}>{message}</div> : null}

      <div style={{ marginBottom: '18px' }}>
        <label style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#2c3e50', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Club Name
        </label>
        <input
          data-testid="system-settings-club-name"
          value={config.branding.clubName ?? ''}
          onChange={(event) => updateConfig(draft => {
            draft.branding.clubName = event.target.value.trim() === '' ? null : event.target.value;
          })}
          style={{ ...valueInputStyle, fontSize: '22px', fontWeight: 600, color: '#2980b9', padding: '10px 14px' }}
        />
      </div>

      <Section
        title="Core Settings"
        sectionId="core"
        open={openSectionId === 'core'}
        onToggle={toggleSection}
      >
        <NumericInput
          label="Minimum Password Length"
          min={6}
          value={config.authPolicy.minimumPasswordLength}
          onChange={(value) => updateConfig(draft => { draft.authPolicy.minimumPasswordLength = value; })}
        />
        <NumericInput
          label="Password Reset TTL (hours)"
          min={1}
          value={config.authPolicy.passwordResetTokenTtlHours}
          onChange={(value) => updateConfig(draft => { draft.authPolicy.passwordResetTokenTtlHours = value; })}
        />
        <NumericInput
          label="Score PIN Length"
          min={4}
          value={config.authPolicy.pinLength}
          onChange={(value) => updateConfig(draft => { draft.authPolicy.pinLength = value; })}
        />
        <FieldRow label="Auto Relinquish Privileges (club default)">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
            <input
              type="checkbox"
              checked={config.authPolicy.autoRelinquishPrivileges}
              onChange={(event) => updateConfig(draft => {
                draft.authPolicy.autoRelinquishPrivileges = event.target.checked;
              })}
            />
            Elevated accounts enter kiosk mode on login by default
          </label>
        </FieldRow>
        <NumericInput
          label="Auto Relinquish Idle (minutes)"
          min={0}
          value={config.authPolicy.autoRelinquishIdleMinutes}
          onChange={(value) => updateConfig(draft => { draft.authPolicy.autoRelinquishIdleMinutes = value; })}
        />
        <p style={{ margin: '0 0 12px 0', fontSize: '12px', color: '#666' }}>
          After restoring privileges, return to kiosk after this many idle minutes (0 = only on login).
        </p>
        <NumericInput
          label="Preregistration Date Offset (days)"
          value={config.preregistration.defaultTournamentOffsetDays}
          onChange={(value) => updateConfig(draft => { draft.preregistration.defaultTournamentOffsetDays = value; })}
        />
        <FieldRow label="Default Tournament Time">
          <input
            type="time"
            value={config.preregistration.defaultTournamentTime}
            onChange={(event) => updateConfig(draft => { draft.preregistration.defaultTournamentTime = event.target.value; })}
            style={valueInputStyle}
          />
        </FieldRow>
        <NumericInput
          label="Registration Deadline Offset (minutes)"
          value={config.preregistration.registrationDeadlineOffsetMinutes}
          onChange={(value) => updateConfig(draft => { draft.preregistration.registrationDeadlineOffsetMinutes = value; })}
        />
        <NumericInput
          label="Rating Input Max"
          value={config.ratingValidation.ratingInputMax}
          onChange={(value) => updateConfig(draft => { draft.ratingValidation.ratingInputMax = value; })}
        />
        <NumericInput
          label="Suspicious Rating Min"
          value={config.ratingValidation.suspiciousRatingMin}
          onChange={(value) => updateConfig(draft => { draft.ratingValidation.suspiciousRatingMin = value; })}
        />
        <NumericInput
          label="Suspicious Rating Max"
          value={config.ratingValidation.suspiciousRatingMax}
          onChange={(value) => updateConfig(draft => { draft.ratingValidation.suspiciousRatingMax = value; })}
        />
        <FieldRow label="Preregistration Cancellation Reasons">
          <textarea
            rows={5}
            value={config.preregistration.cancelReasonPresets.join('\n')}
            onChange={(event) => updateConfig(draft => {
              draft.preregistration.cancelReasonPresets = event.target.value
                .split('\n')
                .map(reason => reason.trim())
                .filter(Boolean);
            })}
            style={{ ...valueInputStyle, minHeight: '110px', resize: 'vertical' }}
          />
        </FieldRow>
      </Section>

      <Section
        title="Tournament Rules"
        sectionId="tournament-rules"
        open={openSectionId === 'tournament-rules'}
        onToggle={toggleSection}
      >
        <ExpandableSubsection
          title="Round Robin"
          subsectionId="round-robin"
          open={openTournamentRuleId === 'round-robin'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.roundRobin.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.roundRobin.minPlayers = value; })} />
          <NumericInput label="Max Players" min={2} value={config.tournamentRules.roundRobin.maxPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.roundRobin.maxPlayers = value; })} />
        </ExpandableSubsection>

        <ExpandableSubsection
          title="Playoff"
          subsectionId="playoff"
          open={openTournamentRuleId === 'playoff'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.playoff.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.playoff.minPlayers = value; })} />
          <NumericInput label="Seed Divisor (1/N of bracket)" min={1} value={config.tournamentRules.playoff.seedDivisor} onChange={(value) => updateConfig(draft => { draft.tournamentRules.playoff.seedDivisor = value; })} />
        </ExpandableSubsection>

        <ExpandableSubsection
          title="Swiss"
          subsectionId="swiss"
          open={openTournamentRuleId === 'swiss'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.swiss.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.swiss.minPlayers = value; })} />
          <NumericInput label="Max Rounds Divisor" min={1} value={config.tournamentRules.swiss.maxRoundsDivisor} onChange={(value) => updateConfig(draft => { draft.tournamentRules.swiss.maxRoundsDivisor = value; })} />
          <FieldRow label="Pair By Rating">
            <input
              type="checkbox"
              checked={config.tournamentRules.swiss.pairByRating}
              onChange={(event) => updateConfig(draft => { draft.tournamentRules.swiss.pairByRating = event.target.checked; })}
              style={{ transform: 'scale(1.15)', accentColor: '#2d6f8f' }}
            />
          </FieldRow>
        </ExpandableSubsection>

        <ExpandableSubsection
          title="Multi Round Robins"
          subsectionId="multi-round-robins"
          open={openTournamentRuleId === 'multi-round-robins'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.multiRoundRobins.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.minPlayers = value; })} />
          <NumericInput label="Min Group Size" min={2} value={config.tournamentRules.multiRoundRobins.minGroupSize} onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.minGroupSize = value; })} />
          <NumericInput label="Max Group Size" min={2} value={config.tournamentRules.multiRoundRobins.maxGroupSize} onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.maxGroupSize = value; })} />
        </ExpandableSubsection>

        <ExpandableSubsection
          title="Preliminary + Final Round Robin"
          subsectionId="preliminary-final-rr"
          open={openTournamentRuleId === 'preliminary-final-rr'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Group Size Min" min={2} value={config.tournamentRules.preliminaryWithFinalRoundRobin.groupSizeMin} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalRoundRobin.groupSizeMin = value; })} />
          <NumericInput label="Group Size Max" min={2} value={config.tournamentRules.preliminaryWithFinalRoundRobin.groupSizeMax} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalRoundRobin.groupSizeMax = value; })} />
          <NumericInput label="Group Size Default" min={2} value={config.tournamentRules.preliminaryWithFinalRoundRobin.groupSizeDefault} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalRoundRobin.groupSizeDefault = value; })} />
          <NumericInput label="Final RR Size Default" min={2} value={config.tournamentRules.preliminaryWithFinalRoundRobin.finalRoundRobinSizeDefault} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalRoundRobin.finalRoundRobinSizeDefault = value; })} />
          <NumericInput label="Reserved Final Spots" value={config.tournamentRules.preliminaryWithFinalRoundRobin.reservedFinalSpotsForAutoQualified} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalRoundRobin.reservedFinalSpotsForAutoQualified = value; })} />
        </ExpandableSubsection>

        <ExpandableSubsection
          title="Preliminary + Final Playoff"
          subsectionId="preliminary-final-playoff"
          open={openTournamentRuleId === 'preliminary-final-playoff'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Group Size Min" min={2} value={config.tournamentRules.preliminaryWithFinalPlayoff.groupSizeMin} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalPlayoff.groupSizeMin = value; })} />
          <NumericInput label="Group Size Max" min={2} value={config.tournamentRules.preliminaryWithFinalPlayoff.groupSizeMax} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalPlayoff.groupSizeMax = value; })} />
          <NumericInput label="Group Size Default" min={2} value={config.tournamentRules.preliminaryWithFinalPlayoff.groupSizeDefault} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalPlayoff.groupSizeDefault = value; })} />
          <NumericInput label="Qualifiers Per Group" min={1} value={config.tournamentRules.preliminaryWithFinalPlayoff.qualifiersPerGroup} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalPlayoff.qualifiersPerGroup = value; })} />
          <NumericInput label="Reserved Final Spots" value={config.tournamentRules.preliminaryWithFinalPlayoff.reservedFinalSpotsForAutoQualified} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminaryWithFinalPlayoff.reservedFinalSpotsForAutoQualified = value; })} />
        </ExpandableSubsection>

        <ExpandableSubsection
          title="Match Score"
          subsectionId="match-score"
          open={openTournamentRuleId === 'match-score'}
          onToggle={toggleTournamentRule}
        >
          <NumericInput label="Min" value={config.tournamentRules.matchScore.min} onChange={(value) => updateConfig(draft => { draft.tournamentRules.matchScore.min = value; })} />
          <NumericInput label="Max" value={config.tournamentRules.matchScore.max} onChange={(value) => updateConfig(draft => { draft.tournamentRules.matchScore.max = value; })} />
          <FieldRow label="Allow Equal Scores">
            <input
              type="checkbox"
              checked={config.tournamentRules.matchScore.allowEqualScores}
              onChange={(event) => updateConfig(draft => { draft.tournamentRules.matchScore.allowEqualScores = event.target.checked; })}
              style={{ transform: 'scale(1.15)', accentColor: '#2d6f8f' }}
            />
          </FieldRow>
        </ExpandableSubsection>
      </Section>

      <Section
        title="Payment Plans and Courtesy Visits"
        sectionId="payment-plans-courtesy"
        open={openSectionId === 'payment-plans-courtesy'}
        onToggle={toggleSection}
      >
        <Subsection title="Segments">
          <p style={{ margin: '8px 0', color: '#666', fontSize: '13px' }}>
            Segments assigned to members that determine which plan price is charged. "Regular" is always required and used as the default fallback.
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
      </Section>

      <Section
        title="Public Achievements"
        sectionId="public-achievements"
        open={openSectionId === 'public-achievements'}
        onToggle={toggleSection}
      >
        <p style={{ margin: '0 0 12px 0', fontSize: '13px', color: '#666' }}>
          How many results to show for each board on the public achievements page.
          Use 0 to hide a board. Positive values include the board and cap the list length.
        </p>
        <FieldRow label="Set all to">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <BoundedNumericInput
              value={achievementsSetAll}
              min={0}
              max={100}
              allowEmpty={false}
              aria-label="Set all achievement counts"
              onChange={(next) => setAchievementsSetAll(next ?? 0)}
              inputStyle={{ ...valueInputStyle, width: '96px' }}
            />
            <button
              type="button"
              className="button-filter"
              onClick={() => updateConfig((draft) => {
                if (!draft.publicAccess) {
                  draft.publicAccess = {
                    achievements: Object.fromEntries(
                      ACHIEVEMENT_CATEGORY_IDS.map((cid) => [cid, 0]),
                    ) as SystemConfig['publicAccess']['achievements'],
                  };
                }
                for (const id of ACHIEVEMENT_CATEGORY_IDS) {
                  draft.publicAccess.achievements[id] = achievementsSetAll;
                }
              })}
            >
              Apply to all
            </button>
          </div>
        </FieldRow>
        {ACHIEVEMENT_CATEGORY_IDS.map((id) => (
          <NumericInput
            key={id}
            label={ACHIEVEMENT_CATEGORY_LABELS[id]}
            min={0}
            max={100}
            value={config.publicAccess?.achievements?.[id] ?? 0}
            onChange={(value) => updateConfig((draft) => {
              if (!draft.publicAccess) {
                draft.publicAccess = {
                  achievements: Object.fromEntries(
                    ACHIEVEMENT_CATEGORY_IDS.map((cid) => [cid, 0]),
                  ) as SystemConfig['publicAccess']['achievements'],
                };
              }
              draft.publicAccess.achievements[id] = value;
            })}
          />
        ))}
      </Section>

      <Section
        title="Operations Settings"
        sectionId="operational"
        open={openSectionId === 'operational'}
        onToggle={toggleSection}
      >
        <NumericInput label="Tournaments Cache TTL (ms)" value={config.clientRuntime.tournamentsListCacheTtlMs} onChange={(value) => updateConfig(draft => { draft.clientRuntime.tournamentsListCacheTtlMs = value; })} />
        <NumericInput label="Socket Reconnection Delay (ms)" value={config.clientRuntime.socketReconnectionDelayMs} onChange={(value) => updateConfig(draft => { draft.clientRuntime.socketReconnectionDelayMs = value; })} />
        <NumericInput label="Socket Reconnection Attempts" value={config.clientRuntime.socketReconnectionAttempts} onChange={(value) => updateConfig(draft => { draft.clientRuntime.socketReconnectionAttempts = value; })} />
      </Section>

      <div
        style={{
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          zIndex: 10050,
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: dirty ? '#1b5e20' : '#455a64',
          color: 'white',
          borderRadius: '10px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, opacity: 0.95 }}>
          {dirty ? 'Unsaved changes' : 'All saved'}
        </span>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !dirty}
          style={{
            padding: '10px 18px',
            fontSize: '15px',
            fontWeight: 700,
            border: 'none',
            borderRadius: '6px',
            background: dirty ? '#fff' : 'rgba(255,255,255,0.35)',
            color: dirty ? '#1b5e20' : '#eceff1',
            cursor: saving || !dirty ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
