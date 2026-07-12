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

/** Stage tabs styled like the app header Players / Tournaments tabs. */
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
        marginTop: '-20px',
        marginLeft: '-20px',
        marginRight: '-20px',
        padding: '10px 20px 0',
        backgroundColor: '#1a5276',
        borderTopLeftRadius: '8px',
        borderTopRightRadius: '8px',
        borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
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
          marginBottom: '-1px',
        }}
      >
        {STAGE_TABS.map((tab) => {
          const count = countForStage(counts, tab);
          const empty = count === 0;
          const selected = stage === tab;
          const clickable = !empty || selected;
          const label =
            tab === 'MATCHES' ? 'Individual Matches' : stageTabLabel(tab);

          let background: string;
          let color: string;
          let border: string;
          let borderBottom: string;
          if (selected) {
            background = 'white';
            color = '#333';
            border = '1px solid rgba(0, 0, 0, 0.1)';
            borderBottom = '1px solid white';
          } else if (empty) {
            background = '#154360';
            color = 'rgba(255, 255, 255, 0.55)';
            border = '1px solid rgba(255, 255, 255, 0.1)';
            borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
          } else {
            background = '#2980b9';
            color = '#ffffff';
            border = '1px solid rgba(255, 255, 255, 0.18)';
            borderBottom = '1px solid rgba(255, 255, 255, 0.18)';
          }

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
                zIndex: selected ? 10 : 1,
                padding: '10px 18px 12px',
                marginBottom: selected ? 0 : '1px',
                border,
                borderBottom,
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
                background,
                color,
                cursor: clickable ? 'pointer' : 'default',
                fontWeight: selected ? 600 : 500,
                fontSize: '15px',
                lineHeight: 1.2,
                boxShadow: selected ? '0 -2px 4px rgba(0, 0, 0, 0.1)' : 'none',
                transition: 'all 0.2s',
              }}
              title={!clickable ? `No ${label.toLowerCase()}` : label}
              onMouseEnter={(e) => {
                if (!selected && clickable) {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = '#3498db';
                }
              }}
              onMouseLeave={(e) => {
                if (!selected && clickable) {
                  e.currentTarget.style.color = '#ffffff';
                  e.currentTarget.style.background = '#2980b9';
                }
              }}
            >
              {label}
              <span
                style={{
                  marginLeft: '6px',
                  fontSize: '13px',
                  fontWeight: selected ? 700 : 600,
                  color: 'inherit',
                  opacity: empty && !selected ? 0.85 : 1,
                }}
              >
                ({count})
              </span>
            </button>
          );
        })}
      </div>
      {trailing ? (
        <div style={{ flexShrink: 0, paddingBottom: '8px' }}>{trailing}</div>
      ) : null}
    </div>
  );
}
