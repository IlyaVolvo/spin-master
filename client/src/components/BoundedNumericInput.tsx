import React, { useEffect, useId, useRef, useState } from 'react';
import {
  commitNumericDraft,
  formatNumericRangeHint,
  isAcceptableNumericDraft,
  isOutOfRangeNumericDraft,
  sanitizeNumericDraft,
  valueToNumericDraft,
} from '../utils/boundedNumericInput';

export type BoundedNumericInputProps = {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** When true, empty field commits as null. When false, blur restores/clamps to a number. */
  allowEmpty?: boolean;
  label?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Extra italic hint after the Min/Max line (e.g. "% of players"). */
  hintExtra?: string;
  /** Hide the automatic Min/Max line (use when a custom hint is provided via hintExtra only). */
  showRangeHint?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  className?: string;
  'aria-label'?: string;
  /** Called after the draft is committed on blur. */
  onBlur?: (value: number | null) => void;
};

const defaultInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px',
  fontSize: '14px',
  border: '1px solid #ddd',
  borderRadius: '4px',
  backgroundColor: 'white',
  boxSizing: 'border-box',
};

const outOfRangeInputStyle: React.CSSProperties = {
  backgroundColor: '#ffcdd2',
  borderColor: '#e57373',
};

const hintStyle: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '12px',
  color: '#666',
  fontStyle: 'italic',
};

/**
 * Numeric entry for settings/setup (not match scores).
 * - No forced default while typing: empty is allowed mid-edit
 * - Focus selects all so the first typed digit replaces the previous value
 * - Intermediate digits below min stay visible (red) so multi-digit entry works
 * - Shows Min/Max when provided
 * - Clamps to bounds on blur
 */
export const BoundedNumericInput: React.FC<BoundedNumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  allowEmpty = false,
  label,
  id: idProp,
  disabled = false,
  placeholder,
  hintExtra,
  showRangeHint = true,
  style,
  inputStyle,
  className,
  'aria-label': ariaLabel,
  onBlur,
}) => {
  const autoId = useId();
  const id = idProp ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => valueToNumericDraft(value));

  useEffect(() => {
    if (!focused) {
      setDraft(valueToNumericDraft(value));
    }
  }, [value, focused]);

  const rangeHint = showRangeHint ? formatNumericRangeHint(min, max) : null;
  const hintText = [rangeHint, hintExtra].filter(Boolean).join(' · ');
  const outOfRange = isOutOfRangeNumericDraft(draft, { min, max });

  const commit = (nextDraft: string) => {
    const committed = commitNumericDraft(nextDraft, {
      min,
      max,
      allowEmpty,
      fallback: typeof value === 'number' && Number.isFinite(value) ? value : (min ?? 0),
    });
    onChange(committed);
    setDraft(valueToNumericDraft(committed));
    return committed;
  };

  return (
    <div className={className} style={style}>
      {label ? (
        <label
          htmlFor={id}
          style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: '#333' }}
        >
          {label}
        </label>
      ) : null}
      <input
        ref={inputRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? label}
        aria-invalid={outOfRange || undefined}
        value={draft}
        onFocus={(event) => {
          setFocused(true);
          event.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          const committed = commit(draft);
          onBlur?.(committed);
        }}
        onChange={(event) => {
          const sanitized = sanitizeNumericDraft(event.target.value);
          if (!isAcceptableNumericDraft(sanitized, { min, max, allowEmpty: true })) {
            return;
          }
          setDraft(sanitized);
          if (sanitized === '') {
            if (allowEmpty) onChange(null);
            return;
          }
          const n = Number(sanitized);
          if (Number.isFinite(n) && (min === undefined || n >= min) && (max === undefined || n <= max)) {
            onChange(n);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
        }}
        style={{
          ...defaultInputStyle,
          ...inputStyle,
          ...(outOfRange ? outOfRangeInputStyle : {}),
        }}
      />
      {hintText ? <div style={hintStyle}>{hintText}</div> : null}
    </div>
  );
};

export default BoundedNumericInput;
