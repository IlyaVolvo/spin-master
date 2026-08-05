import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { isAdmin } from '../utils/auth';
import {
  ACHIEVEMENT_CATEGORY_IDS,
  ACHIEVEMENT_CATEGORY_LABELS,
  loadAdminSystemConfig,
  saveAdminSystemConfig,
  SystemConfig,
  type ClubDayHours,
  type ClubWeekday,
} from '../utils/systemConfig';
import { getErrorMessage } from '../utils/errorHandler';
import { BoundedNumericInput } from './BoundedNumericInput';

const WEEKDAY_ROWS: { key: ClubWeekday; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const SESSION_OPEN_SECTION = 'systemSettings_session_openSection';
const SESSION_OPEN_TOURNAMENT_RULE = 'systemSettings_session_openTournamentRule';
const SESSION_HOURS_OPEN = 'systemSettings_session_hoursOpen';

function readSessionString(key: string, fallback: string): string {
  try {
    const saved = sessionStorage.getItem(key);
    return saved == null ? fallback : saved;
  } catch {
    return fallback;
  }
}

function writeSessionString(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function readSessionBool(key: string, fallback: boolean): boolean {
  try {
    const saved = sessionStorage.getItem(key);
    if (saved == null) return fallback;
    return saved === '1' || saved === 'true';
  } catch {
    return fallback;
  }
}

function writeSessionBool(key: string, value: boolean): void {
  writeSessionString(key, value ? '1' : '0');
}

function DollarsFromCentsInput({
  cents,
  onCentsChange,
  ariaLabel,
  inputStyle,
}: {
  cents: number;
  onCentsChange: (cents: number) => void;
  ariaLabel: string;
  inputStyle?: CSSProperties;
}) {
  const [text, setText] = useState(() => (cents / 100).toFixed(2));

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
      aria-label={ariaLabel}
      value={text}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9.]/g, '');
        const parts = v.split('.');
        const normalized = parts.length <= 1 ? v : `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
        setText(normalized);
        if (normalized !== '' && normalized !== '.' && Number.isFinite(Number(normalized))) {
          onCentsChange(Math.round(Number(normalized) * 100));
        }
      }}
      onBlur={() => commit(text)}
      style={inputStyle}
    />
  );
}

type NumericInputProps = {
  label: string;
  tooltip?: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

function NumericInput({ label, tooltip, value, min = 0, max, onChange }: NumericInputProps) {
  return (
    <FieldRow label={label} tooltip={tooltip}>
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

function FieldRow({ label, tooltip, children }: { label: string; tooltip?: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 32%) 1fr',
      gap: '18px',
      alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid #edf1f5',
    }}>
      <div
        title={tooltip}
        style={{
          color: '#2d6f8f',
          fontWeight: 700,
          letterSpacing: '0.01em',
        }}
      >
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
  tooltip,
  sectionId,
  open,
  onToggle,
  children,
}: {
  title: string;
  tooltip?: string;
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
        title={tooltip}
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

export default function SystemSettings() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [achievementsSetAll, setAchievementsSetAll] = useState(10);
  const [dirty, setDirty] = useState(false);
  const [openSectionId, setOpenSectionId] = useState<string>(() => {
    const saved = readSessionString(SESSION_OPEN_SECTION, '');
    return saved === 'event' ? 'preregistration-event' : saved;
  });
  const [openTournamentRuleId, setOpenTournamentRuleId] = useState<string | null>(() => {
    const saved = readSessionString(SESSION_OPEN_TOURNAMENT_RULE, '');
    return saved || null;
  });
  const [hoursOpen, setHoursOpen] = useState(() => readSessionBool(SESSION_HOURS_OPEN, false));

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
      writeSessionString(SESSION_OPEN_SECTION, next);
      return next;
    });
  };

  const toggleTournamentRule = (id: string) => {
    setOpenTournamentRuleId((current) => {
      const next = current === id ? null : id;
      writeSessionString(SESSION_OPEN_TOURNAMENT_RULE, next ?? '');
      return next;
    });
  };

  const toggleHoursOpen = () => {
    setHoursOpen((open) => {
      const next = !open;
      writeSessionBool(SESSION_HOURS_OPEN, next);
      return next;
    });
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
      // Do not overwrite payment settings managed on /payments
      const { payments: _payments, clubPlans: _clubPlans, ...systemPatch } = config;
      const saved = await saveAdminSystemConfig(systemPatch);
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
        <h2
          style={{ margin: 0 }}
          title="Open a section to edit. Use Save when your changes are ready."
        >
          System Settings
        </h2>
      </div>

      {error ? <div className="error-message" style={{ marginBottom: '16px' }}>{error}</div> : null}
      {message ? <div className="success-message" style={{ marginBottom: '16px' }}>{message}</div> : null}

      <div
        style={{
          marginBottom: '18px',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <label
            style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#2c3e50', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            title="Shown above the main panel for members (and on login / public pages)."
          >
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
        <div style={{ flex: '0 0 auto', marginLeft: 'auto', textAlign: 'right' }}>
          <label
            htmlFor="system-settings-club-timezone"
            style={{ display: 'block', fontWeight: 700, fontSize: '13px', color: '#2c3e50', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            title="Used for club calendar days (check-in, trials, midnight jobs). Defaults from CLUB_TIMEZONE env if unset."
          >
            Club Timezone
          </label>
          <select
            id="system-settings-club-timezone"
            data-testid="system-settings-club-timezone"
            value={config.branding.clubTimezone || 'UTC'}
            onChange={(event) => updateConfig((draft) => {
              draft.branding.clubTimezone = event.target.value;
            })}
            style={{ ...valueInputStyle, fontSize: '14px', fontWeight: 500, width: 'auto', minWidth: '220px', maxWidth: '320px' }}
          >
            {(() => {
              const known = [
                'UTC',
                'America/Los_Angeles',
                'America/Denver',
                'America/Phoenix',
                'America/Chicago',
                'America/New_York',
                'America/Anchorage',
                'Pacific/Honolulu',
                'Europe/London',
                'Europe/Paris',
                'Asia/Tokyo',
                'Australia/Sydney',
              ];
              const current = config.branding.clubTimezone || 'UTC';
              const options = known.includes(current) ? known : [current, ...known];
              const labels: Record<string, string> = {
                UTC: 'UTC',
                'America/Los_Angeles': 'America/Los_Angeles (Pacific)',
                'America/Denver': 'America/Denver (Mountain)',
                'America/Phoenix': 'America/Phoenix (Arizona)',
                'America/Chicago': 'America/Chicago (Central)',
                'America/New_York': 'America/New_York (Eastern)',
                'America/Anchorage': 'America/Anchorage',
                'Pacific/Honolulu': 'Pacific/Honolulu',
                'Europe/London': 'Europe/London',
                'Europe/Paris': 'Europe/Paris',
                'Asia/Tokyo': 'Asia/Tokyo',
                'Australia/Sydney': 'Australia/Sydney',
              };
              return options.map((tz) => (
                <option key={tz} value={tz}>{labels[tz] || tz}</option>
              ));
            })()}
          </select>
        </div>
      </div>
      <div style={{
        marginBottom: '18px',
        border: '1px solid #e1ebf2',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#ffffff',
      }}>
        <button
          type="button"
          onClick={toggleHoursOpen}
          aria-expanded={hoursOpen}
          data-testid="system-settings-hours-toggle"
          title="Per weekday schedule in the club timezone. Same-day open/close only (no overnight). Date overrides replace that day’s default."
          style={{
            width: '100%',
            margin: 0,
            padding: '10px 14px',
            backgroundColor: '#f2f8fb',
            color: '#3c7890',
            border: 'none',
            borderBottom: hoursOpen ? '1px solid #e1ebf2' : 'none',
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
          <span>Open / Close hours</span>
          <span style={{ fontSize: '12px', opacity: 0.75, textTransform: 'none', letterSpacing: 0 }} aria-hidden>
            {hoursOpen ? '▼' : '▶'}
          </span>
        </button>
        {hoursOpen ? (
          <div style={{ padding: '12px 14px 16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '18px' }}>
              {WEEKDAY_ROWS.map(({ key, label }) => {
                const day = config.branding.weeklyHours[key];
                const closed = day.closed === true;
                return (
                  <div
                    key={key}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '100px 90px 1fr 1fr',
                      gap: '8px',
                      alignItems: 'center',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#2c3e50' }}>{label}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                      <input
                        type="checkbox"
                        checked={closed}
                        onChange={(e) => updateConfig((draft) => {
                          draft.branding.weeklyHours[key] = e.target.checked
                            ? { closed: true }
                            : { closed: false, open: '10:00', close: '22:00' };
                        })}
                      />
                      Closed
                    </label>
                    <input
                      type="time"
                      disabled={closed}
                      value={closed ? '' : day.open}
                      onChange={(e) => updateConfig((draft) => {
                        const cur = draft.branding.weeklyHours[key];
                        if (cur.closed) return;
                        draft.branding.weeklyHours[key] = { closed: false, open: e.target.value || '10:00', close: cur.close };
                      })}
                      style={valueInputStyle}
                      aria-label={`${label} open`}
                    />
                    <input
                      type="time"
                      disabled={closed}
                      value={closed ? '' : day.close}
                      onChange={(e) => updateConfig((draft) => {
                        const cur = draft.branding.weeklyHours[key];
                        if (cur.closed) return;
                        draft.branding.weeklyHours[key] = { closed: false, open: cur.open, close: e.target.value || '22:00' };
                      })}
                      style={valueInputStyle}
                      aria-label={`${label} close`}
                    />
                  </div>
                );
              })}
            </div>

            <div
              style={{ fontWeight: 700, fontSize: '13px', color: '#2c3e50', marginBottom: '8px' }}
              title="Replace the weekday default for a specific date. Optional comment is shown next to the club name for members."
            >
              Date overrides
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(config.branding.hourOverrides ?? []).map((row, index) => {
                const closed = row.hours.closed === true;
                return (
                  <div
                    key={`${row.date}-${index}`}
                    style={{
                      border: '1px solid #edf1f5',
                      borderRadius: '6px',
                      padding: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateConfig((draft) => {
                          draft.branding.hourOverrides[index].date = e.target.value;
                        })}
                        style={{ ...valueInputStyle, maxWidth: '160px' }}
                        aria-label={`Override ${index + 1} date`}
                      />
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <input
                          type="checkbox"
                          checked={closed}
                          onChange={(e) => updateConfig((draft) => {
                            draft.branding.hourOverrides[index].hours = e.target.checked
                              ? { closed: true }
                              : { closed: false, open: '10:00', close: '22:00' };
                          })}
                        />
                        Closed
                      </label>
                      <input
                        type="time"
                        disabled={closed}
                        value={closed ? '' : (row.hours as Extract<ClubDayHours, { closed: false }>).open}
                        onChange={(e) => updateConfig((draft) => {
                          const cur = draft.branding.hourOverrides[index].hours;
                          if (cur.closed) return;
                          draft.branding.hourOverrides[index].hours = {
                            closed: false,
                            open: e.target.value || '10:00',
                            close: cur.close,
                          };
                        })}
                        style={{ ...valueInputStyle, maxWidth: '120px' }}
                      />
                      <input
                        type="time"
                        disabled={closed}
                        value={closed ? '' : (row.hours as Extract<ClubDayHours, { closed: false }>).close}
                        onChange={(e) => updateConfig((draft) => {
                          const cur = draft.branding.hourOverrides[index].hours;
                          if (cur.closed) return;
                          draft.branding.hourOverrides[index].hours = {
                            closed: false,
                            open: cur.open,
                            close: e.target.value || '22:00',
                          };
                        })}
                        style={{ ...valueInputStyle, maxWidth: '120px' }}
                      />
                      <button
                        type="button"
                        onClick={() => updateConfig((draft) => {
                          draft.branding.hourOverrides.splice(index, 1);
                        })}
                        style={{
                          padding: '6px 10px',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                          background: '#fff',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      type="text"
                      value={row.comment ?? ''}
                      placeholder="Comment (shown next to club name for members)"
                      onChange={(e) => updateConfig((draft) => {
                        draft.branding.hourOverrides[index].comment =
                          e.target.value.trim() === '' ? null : e.target.value;
                      })}
                      style={valueInputStyle}
                      aria-label={`Override ${index + 1} comment`}
                    />
                  </div>
                );
              })}
              <button
                type="button"
                onClick={() => updateConfig((draft) => {
                  if (!draft.branding.hourOverrides) draft.branding.hourOverrides = [];
                  draft.branding.hourOverrides.push({
                    date: new Date().toISOString().slice(0, 10),
                    hours: { closed: true },
                    comment: null,
                  });
                })}
                style={{
                  alignSelf: 'flex-start',
                  padding: '8px 12px',
                  border: '1px solid #b9c7d8',
                  borderRadius: '6px',
                  background: '#f8fbff',
                  color: '#1a5276',
                  fontWeight: 700,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Add date override
              </button>
            </div>
          </div>
        ) : null}
      </div>


      <Section
        title="Tournament Rules"
        tooltip="Limits and defaults for each tournament type (player counts, group sizes, match scores)."
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
          <NumericInput label="Early Complete Min %" min={1} max={100} value={config.tournamentRules.roundRobin.earlyCompleteMinPercent} onChange={(value) => updateConfig(draft => { draft.tournamentRules.roundRobin.earlyCompleteMinPercent = value; })} />
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
          <NumericInput
            label="Default Size"
            min={config.tournamentRules.roundRobin.minPlayers}
            max={config.tournamentRules.roundRobin.maxPlayers}
            value={config.tournamentRules.multiRoundRobins.defaultSize}
            onChange={(value) => updateConfig(draft => { draft.tournamentRules.multiRoundRobins.defaultSize = value; })}
          />
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
        title="Public Achievements"
        tooltip="How many results to show for each board on the public achievements page. Use 0 to hide a board. Positive values include the board and cap the list length."
        sectionId="public-achievements"
        open={openSectionId === 'public-achievements'}
        onToggle={toggleSection}
      >
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
        title="Core Settings"
        tooltip="Authentication, score PIN, privilege auto-relinquish, and rating validation."
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
          tooltip="After restoring privileges, return to kiosk after this many idle minutes (0 = only on login)."
          min={0}
          value={config.authPolicy.autoRelinquishIdleMinutes}
          onChange={(value) => updateConfig(draft => { draft.authPolicy.autoRelinquishIdleMinutes = value; })}
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
      </Section>

      <Section
        title="Pre-registration/Event Settings"
        tooltip="Defaults for tournament pre-registration and paid events. Per-event overrides live on the event itself."
        sectionId="preregistration-event"
        open={openSectionId === 'preregistration-event'}
        onToggle={toggleSection}
      >
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
        <FieldRow
          label="Admissions starts"
          tooltip="How long before event start members can check in as event attendees (club default). Overridable on each event."
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <BoundedNumericInput
              value={Math.floor(config.preregistration.eventCheckInLeadMinutes / 60)}
              min={0}
              max={168}
              allowEmpty={false}
              showRangeHint={false}
              aria-label="Admissions starts hours before event"
              onChange={(hours) => {
                const h = hours ?? 0;
                const minutes = config.preregistration.eventCheckInLeadMinutes % 60;
                updateConfig((draft) => {
                  draft.preregistration.eventCheckInLeadMinutes = h * 60 + minutes;
                });
              }}
              inputStyle={{ ...valueInputStyle, width: '72px' }}
            />
            <span style={{ fontSize: '13px', color: '#546e7a' }}>hours</span>
            <BoundedNumericInput
              value={config.preregistration.eventCheckInLeadMinutes % 60}
              min={0}
              max={59}
              allowEmpty={false}
              showRangeHint={false}
              aria-label="Admissions starts minutes before event"
              onChange={(mins) => {
                const m = mins ?? 0;
                const hours = Math.floor(config.preregistration.eventCheckInLeadMinutes / 60);
                updateConfig((draft) => {
                  draft.preregistration.eventCheckInLeadMinutes = hours * 60 + m;
                });
              }}
              inputStyle={{ ...valueInputStyle, width: '72px' }}
            />
            <span style={{ fontSize: '13px', color: '#546e7a' }}>minutes before event start</span>
          </div>
        </FieldRow>
        <FieldRow
          label="Default event price"
          tooltip="Default list price for new events. Overridable on each event."
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '14px', color: '#546e7a' }}>$</span>
            <DollarsFromCentsInput
              cents={config.preregistration.defaultEventPriceCents}
              ariaLabel="Default event price dollars"
              onCentsChange={(next) => updateConfig((draft) => {
                draft.preregistration.defaultEventPriceCents = next;
              })}
              inputStyle={{ ...valueInputStyle, width: '100px' }}
            />
          </div>
        </FieldRow>
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
        title="Operations Settings"
        tooltip="Client runtime tuning: API request timeout, tournaments list cache TTL, and socket reconnection behavior."
        sectionId="operational"
        open={openSectionId === 'operational'}
        onToggle={toggleSection}
      >
        <NumericInput label="API Request Timeout (ms)" value={config.clientRuntime.apiRequestTimeoutMs} onChange={(value) => updateConfig(draft => { draft.clientRuntime.apiRequestTimeoutMs = value; })} />
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
