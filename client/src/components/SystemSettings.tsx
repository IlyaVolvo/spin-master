import { useEffect, useState } from 'react';
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
import { BoundedNumericInput } from './BoundedNumericInput';

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card" style={{ marginBottom: '22px', padding: 0, overflow: 'hidden' }}>
      <h3 style={{
        margin: 0,
        padding: '14px 18px',
        background: 'linear-gradient(90deg, #eaf5fb, #f7fbfd)',
        color: '#155b78',
        borderBottom: '1px solid #d8e8f0',
        fontSize: '17px',
      }}>
        {title}
      </h3>
      <div style={{ padding: '4px 18px 8px' }}>
        {children}
      </div>
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

export default function SystemSettings() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [achievementsSetAll, setAchievementsSetAll] = useState(10);

  useEffect(() => {
    let cancelled = false;
    if (!isAdmin()) {
      setLoading(false);
      return;
    }
    loadAdminSystemConfig()
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
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

  const updateConfig = (updater: (draft: SystemConfig) => void) => {
    setConfig((current) => {
      if (!current) return current;
      const draft = structuredClone(current);
      updater(draft);
      return draft;
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const saved = await saveAdminSystemConfig(config);
      setConfig(saved);
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0 }}>System Settings</h2>
          <p style={{ margin: '6px 0 0', color: '#666' }}>
            Administrator-only settings are persisted in the database and applied immediately after save.
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {error ? <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div> : null}
      {message ? <div className="success-message" style={{ marginBottom: '16px' }}>{message}</div> : null}

      <div style={{ marginBottom: '24px' }}>
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

      <Section title="Payment Categories">
        <p style={{ margin: '0 0 8px', color: '#666', fontSize: '13px' }}>
          Categories assigned to members that determine plan pricing. "Regular" is always required and used as the default.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
          {(config.clubPlans?.categories ?? ['Regular']).map((cat, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: '#eaf2f8', color: '#2c3e50', padding: '4px 10px',
              borderRadius: '14px', fontSize: '13px', fontWeight: 500,
            }}>
              {cat}
              {cat !== 'Regular' && (
                <button
                  type="button"
                  onClick={() => updateConfig(draft => {
                    draft.clubPlans.categories = draft.clubPlans.categories.filter((_: string, idx: number) => idx !== i);
                  })}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#c0392b', fontWeight: 700, fontSize: '14px', padding: '0 2px', lineHeight: 1,
                  }}
                  title="Remove category"
                >×</button>
              )}
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input
            placeholder="New category name…"
            id="new-category-input"
            style={{ ...valueInputStyle, flex: 1, maxWidth: '200px' }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const input = e.currentTarget;
                const val = input.value.trim();
                if (val && !(config.clubPlans?.categories ?? []).includes(val)) {
                  updateConfig(draft => { draft.clubPlans.categories = [...(draft.clubPlans.categories ?? ['Regular']), val]; });
                  input.value = '';
                }
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              const input = document.getElementById('new-category-input') as HTMLInputElement;
              const val = input?.value.trim();
              if (val && !(config.clubPlans?.categories ?? []).includes(val)) {
                updateConfig(draft => { draft.clubPlans.categories = [...(draft.clubPlans.categories ?? ['Regular']), val]; });
                input.value = '';
              }
            }}
            style={{ padding: '4px 12px', fontSize: '13px' }}
          >Add</button>
        </div>
      </Section>

      <Section title="Club Payment Plans">
        <ClubPlanManager />
      </Section>

      <Section title="Core Settings">
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

      <Section title="Tournament Rules">
        <Subsection title="Round Robin">
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.roundRobin.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.roundRobin.minPlayers = value; })} />
          <NumericInput label="Max Players" min={2} value={config.tournamentRules.roundRobin.maxPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.roundRobin.maxPlayers = value; })} />
        </Subsection>

        <Subsection title="Playoff">
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.playoff.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.playoff.minPlayers = value; })} />
          <NumericInput label="Seed Divisor (1/N of bracket)" min={1} value={config.tournamentRules.playoff.seedDivisor} onChange={(value) => updateConfig(draft => { draft.tournamentRules.playoff.seedDivisor = value; })} />
        </Subsection>

        <Subsection title="Swiss">
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
        </Subsection>

        <Subsection title="Multi Round Robins">
          <NumericInput label="Min Players" min={2} value={config.tournamentRules.multiRoundRobins.minPlayers} onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.minPlayers = value; })} />
          <NumericInput label="Min Group Size" min={2} value={config.tournamentRules.multiRoundRobins.minGroupSize} onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.minGroupSize = value; })} />
          <NumericInput label="Max Group Size" min={2} value={config.tournamentRules.multiRoundRobins.maxGroupSize} onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.maxGroupSize = value; })} />
        </Subsection>

        <Subsection title="Preliminary">
          <NumericInput label="Group Size Min" min={2} value={config.tournamentRules.preliminary.groupSizeMin} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminary.groupSizeMin = value; })} />
          <NumericInput label="Group Size Max" min={2} value={config.tournamentRules.preliminary.groupSizeMax} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminary.groupSizeMax = value; })} />
          <NumericInput label="Group Size Default" min={2} value={config.tournamentRules.preliminary.groupSizeDefault} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminary.groupSizeDefault = value; })} />
          <NumericInput label="Final RR Size Default" min={2} value={config.tournamentRules.preliminary.finalRoundRobinSizeDefault} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminary.finalRoundRobinSizeDefault = value; })} />
          <NumericInput label="Reserved Final Spots" value={config.tournamentRules.preliminary.reservedFinalSpotsForAutoQualified} onChange={(value) => updateConfig(draft => { draft.tournamentRules.preliminary.reservedFinalSpotsForAutoQualified = value; })} />
        </Subsection>

        <Subsection title="Match Score">
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
        </Subsection>
      </Section>

      <Section title="Public Achievements">
        <p style={{ margin: '0 0 12px 0', padding: '0 18px', fontSize: '13px', color: '#666' }}>
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

      <Section title="Operational Settings">
        <NumericInput label="Tournaments Cache TTL (ms)" value={config.clientRuntime.tournamentsListCacheTtlMs} onChange={(value) => updateConfig(draft => { draft.clientRuntime.tournamentsListCacheTtlMs = value; })} />
        <NumericInput label="Socket Reconnection Delay (ms)" value={config.clientRuntime.socketReconnectionDelayMs} onChange={(value) => updateConfig(draft => { draft.clientRuntime.socketReconnectionDelayMs = value; })} />
        <NumericInput label="Socket Reconnection Attempts" value={config.clientRuntime.socketReconnectionAttempts} onChange={(value) => updateConfig(draft => { draft.clientRuntime.socketReconnectionAttempts = value; })} />
      </Section>

    </div>
  );
}
