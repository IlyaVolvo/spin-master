import React from 'react';
import {
  getSupportedResultsPrintModes,
  isResultsPrintMode,
  type ResultsPrintMode,
} from '../tournaments/utils/resultsPrintModes';

/** Plain Print, or Standard / Detailed / Abbreviated dropdown when extra modes are supported. */
export function ResultsPrintControl({
  accentColor,
  title,
  supportedModes,
  onSelect,
}: {
  accentColor: string;
  title: string;
  supportedModes: ResultsPrintMode[];
  onSelect: (mode: ResultsPrintMode) => void;
}) {
  const buttonStyle: React.CSSProperties = {
    padding: '6px 12px',
    border: `1px solid ${accentColor}`,
    borderRadius: '4px',
    backgroundColor: '#fff',
    color: accentColor,
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 'bold',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
  };

  const hasExtraModes = supportedModes.some((mode) => mode !== 'standard');
  if (!hasExtraModes) {
    return (
      <button type="button" onClick={() => onSelect('standard')} title={title} style={buttonStyle}>
        Print
      </button>
    );
  }

  return (
    <select
      aria-label="Print results format"
      title="Print results — Standard or Abbreviated"
      defaultValue=""
      onChange={(event) => {
        const value = event.target.value;
        event.target.value = '';
        if (isResultsPrintMode(value) && supportedModes.includes(value)) {
          onSelect(value);
        }
      }}
      style={buttonStyle}
    >
      <option value="" disabled>
        Print ▾
      </option>
      {supportedModes.includes('standard') && <option value="standard">Standard</option>}
      {supportedModes.includes('detailed') && <option value="detailed">Detailed</option>}
      {supportedModes.includes('abbreviated') && <option value="abbreviated">Abbreviated</option>}
    </select>
  );
}

export { getSupportedResultsPrintModes };
export type { ResultsPrintMode };
