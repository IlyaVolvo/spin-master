import type { CSSProperties } from 'react';
import type { CheckInOption } from '../utils/checkInOptions';
import { formatCheckInOptionLabel } from '../utils/checkInOptions';

type CheckInOptionSelectProps = {
  options: CheckInOption[];
  valueId: string | null;
  onChange: (optionId: string) => void;
  disabled?: boolean;
  label?: string;
  style?: CSSProperties;
};

/**
 * Dropdown of check-in choices. Disabled options are greyed (native option disabled).
 * Shown whenever there is at least one option so the user can confirm before PIN submit.
 */
export function CheckInOptionSelect({
  options,
  valueId,
  onChange,
  disabled = false,
  label = 'Check-in type',
  style,
}: CheckInOptionSelectProps) {
  return (
    <div style={{ marginBottom: '12px', ...style }}>
      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
        {label}
      </label>
      <select
        value={valueId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
      >
        {options.map((option) => (
          <option
            key={option.id}
            value={option.id}
            disabled={!option.actionable}
            style={!option.actionable ? { color: '#999' } : undefined}
          >
            {formatCheckInOptionLabel(option)}
          </option>
        ))}
      </select>
      {(() => {
        const selected = options.find((o) => o.id === valueId);
        if (!selected?.clubChargeWarning) return null;
        return (
          <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#856404' }}>
            {selected.clubChargeWarning}
          </p>
        );
      })()}
    </div>
  );
}

type CheckInOptionMenuProps = {
  options: CheckInOption[];
  onSelect: (option: CheckInOption) => void;
  onCancel: () => void;
  busy?: boolean;
  title?: string;
};

/**
 * Menu for authenticated self-check-in. Selecting an actionable option executes;
 * Cancel / backdrop dismisses without checking in. Disabled rows are non-clickable.
 */
export function CheckInOptionMenu({
  options,
  onSelect,
  onCancel,
  busy = false,
  title = 'Choose check-in',
}: CheckInOptionMenuProps) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.55)',
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={() => !busy && onCancel()}
    >
      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '400px',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkin-option-menu-title"
      >
        <h3 id="checkin-option-menu-title" style={{ marginTop: 0 }}>
          {title}
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {options.map((option) => {
            const label = formatCheckInOptionLabel(option);
            if (!option.actionable) {
              return (
                <div
                  key={option.id}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '4px',
                    border: '1px solid #e0e0e0',
                    backgroundColor: '#f5f5f5',
                    color: '#888',
                    fontSize: '14px',
                  }}
                >
                  {label}
                </div>
              );
            }
            return (
              <button
                key={option.id}
                type="button"
                className="success"
                disabled={busy}
                onClick={() => onSelect(option)}
                style={{ width: '100%', textAlign: 'left', padding: '10px 12px' }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
