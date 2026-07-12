import React from 'react';
import {
  stageTabLabel,
  type TournamentStageTab,
} from '../../utils/tournamentNavState';

export const STAGE_TABS: TournamentStageTab[] = [
  'PRE_REGISTRATION',
  'ACTIVE',
  'COMPLETED',
  'MATCHES',
];

export interface StageCounts {
  preRegistration: number;
  active: number;
  completed: number;
  matches: number;
}

export function countForStage(counts: StageCounts | null, stage: TournamentStageTab): number {
  if (!counts) return 0;
  switch (stage) {
    case 'PRE_REGISTRATION':
      return counts.preRegistration;
    case 'ACTIVE':
      return counts.active;
    case 'COMPLETED':
      return counts.completed;
    case 'MATCHES':
      return counts.matches;
    default:
      return 0;
  }
}

interface TournamentStageTabsProps {
  stage: TournamentStageTab;
  counts: StageCounts | null;
  onSelect: (stage: TournamentStageTab) => void;
  /** Optional control rendered on the right of the tab row (e.g. Back). */
  trailing?: React.ReactNode;
}

/** Classic tab strip: selected elevated, empty stages muted but still visible. */
export function TournamentStageTabs({
  stage,
  counts,
  onSelect,
  trailing,
}: TournamentStageTabsProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: '12px',
        marginBottom: '16px',
        borderBottom: '2px solid #cfd8dc',
      }}
    >
      <div
        role="tablist"
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          gap: '2px',
          flexWrap: 'wrap',
          flex: 1,
          minWidth: 0,
        }}
      >
        {STAGE_TABS.map((tab) => {
          const count = countForStage(counts, tab);
          const empty = count === 0;
          const selected = stage === tab;
          const clickable = !empty || selected;
          const label =
            tab === 'MATCHES' ? 'Individual Matches' : stageTabLabel(tab);

          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-disabled={!clickable}
              disabled={!clickable}
              onClick={() => {
                if (clickable) onSelect(tab);
              }}
              style={{
                position: 'relative',
                top: selected ? '2px' : 0,
                padding: '10px 18px 12px',
                marginBottom: selected ? '-2px' : 0,
                border: selected ? '2px solid #2980b9' : '1px solid #e0e0e0',
                borderBottom: selected ? '2px solid #3498db' : '1px solid #cfd8dc',
                borderRadius: '8px 8px 0 0',
                backgroundColor: empty && !selected
                  ? '#f4f4f4'
                  : selected
                    ? '#3498db'
                    : '#eceff1',
                color: empty && !selected ? '#b0b0b0' : '#111111',
                cursor: clickable ? 'pointer' : 'default',
                fontWeight: selected ? 700 : 500,
                fontSize: '14px',
                lineHeight: 1.2,
                boxShadow: selected ? 'none' : 'none',
              }}
              title={!clickable ? `No ${label.toLowerCase()}` : label}
            >
              {label}
              <span
                style={{
                  marginLeft: '8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: empty && !selected ? '#c0c0c0' : '#111111',
                }}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>
      {trailing ? (
        <div style={{ flexShrink: 0, paddingBottom: '6px' }}>{trailing}</div>
      ) : null}
    </div>
  );
}
