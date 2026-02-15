import React from 'react';
import type {
  TournamentPlugin,
  TournamentSetupProps,
  TournamentActiveProps,
  TournamentScheduleProps,
  TournamentCompletedProps,
  TournamentCreationFlow,
} from '../../../types/tournament';
import { PreliminaryWithFinalRoundRobinPostSelectionFlow } from './PreliminaryWithFinalRoundRobinPostSelectionFlow';
import { formatPlayerName, getNameDisplayOrder } from '../../../utils/nameFormatter';

// ─── Active Panel ────────────────────────────────────────────────────────────
// Shows child tournaments (preliminary groups + final if created) with their status
const PreliminaryWithFinalRoundRobinActivePanel: React.FC<TournamentActiveProps> = ({
  tournament,
  onTournamentUpdate,
  onMatchUpdate,
  onError,
  onSuccess,
}) => {
  const children = tournament.childTournaments || [];
  const preliminaryGroups = children
    .filter(c => c.groupNumber !== null && c.groupNumber !== undefined)
    .sort((a, b) => (a.groupNumber ?? 0) - (b.groupNumber ?? 0));
  const finalTournament = children.find(c => c.groupNumber === null || c.groupNumber === undefined);

  const config = tournament.preliminaryConfig;
  const autoQualifiedMemberIds: number[] = config?.autoQualifiedMemberIds || [];
  const finalRoundRobinSize: number = config?.finalSize || 0;

  const allPreliminariesComplete = preliminaryGroups.length > 0 && preliminaryGroups.every(c => c.status === 'COMPLETED');

  return (
    <div style={{ padding: '10px' }}>
      {/* Configuration info */}
      <div style={{
        padding: '12px',
        backgroundColor: '#f0f7ff',
        borderRadius: '6px',
        border: '1px solid #c8ddf5',
        marginBottom: '15px',
        fontSize: '13px',
      }}>
        <strong>Final Round Robin:</strong> {finalRoundRobinSize} players
        {autoQualifiedMemberIds.length > 0 && (
          <span> | <strong>Auto-qualified:</strong> {autoQualifiedMemberIds.length}</span>
        )}
        {' | '}<strong>Preliminary groups:</strong> {preliminaryGroups.length}
      </div>

      {/* Auto-qualified players */}
      {autoQualifiedMemberIds.length > 0 && (
        <div style={{
          border: '2px solid #f39c12',
          borderRadius: '8px',
          padding: '12px',
          backgroundColor: '#fef9e7',
          marginBottom: '15px',
        }}>
          <h5 style={{ margin: '0 0 8px 0', color: '#f39c12', fontSize: '14px' }}>
            Auto-Qualified Players (→ Final)
          </h5>
          {autoQualifiedMemberIds.map((memberId: number) => {
            const participant = tournament.participants?.find(p => p.memberId === memberId);
            if (!participant) return null;
            return (
              <div key={memberId} style={{
                padding: '4px 8px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '13px',
              }}>
                <span>{formatPlayerName(participant.member.firstName, participant.member.lastName, getNameDisplayOrder())}</span>
                {participant.playerRatingAtTime && (
                  <span style={{ color: '#f39c12', fontWeight: 'bold' }}>{participant.playerRatingAtTime}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Preliminary groups */}
      <h4 style={{ marginBottom: '10px' }}>Preliminary Groups</h4>
      {preliminaryGroups.map(group => (
        <div key={group.id} style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '10px',
          backgroundColor: group.status === 'COMPLETED' ? '#f0fff0' : 'white',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h5 style={{ margin: 0, color: '#3498db' }}>
              {group.name}
            </h5>
            <span style={{
              padding: '2px 8px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: 'bold',
              backgroundColor: group.status === 'COMPLETED' ? '#27ae60' : '#f39c12',
              color: 'white',
            }}>
              {group.status}
            </span>
          </div>
          <div style={{ fontSize: '13px', color: '#666' }}>
            {group.participants?.length || 0} players | {group.matches?.filter((m: any) =>
              (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit)
            ).length || 0} / {((group.participants?.length || 0) * ((group.participants?.length || 0) - 1)) / 2} matches played
          </div>
        </div>
      ))}

      {/* Final Round Robin */}
      {finalTournament ? (
        <div style={{ marginTop: '15px' }}>
          <h4 style={{ marginBottom: '10px' }}>Final Round Robin</h4>
          <div style={{
            border: '2px solid #27ae60',
            borderRadius: '8px',
            padding: '12px',
            backgroundColor: finalTournament.status === 'COMPLETED' ? '#f0fff0' : '#f0fff4',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h5 style={{ margin: 0, color: '#27ae60' }}>
                {finalTournament.name}
              </h5>
              <span style={{
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 'bold',
                backgroundColor: finalTournament.status === 'COMPLETED' ? '#27ae60' : '#3498db',
                color: 'white',
              }}>
                {finalTournament.status}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: '#666' }}>
              {finalTournament.participants?.length || 0} players | {finalTournament.matches?.filter((m: any) =>
                (m.player1Sets > 0 || m.player2Sets > 0 || m.player1Forfeit || m.player2Forfeit)
              ).length || 0} / {((finalTournament.participants?.length || 0) * ((finalTournament.participants?.length || 0) - 1)) / 2} matches played
            </div>
          </div>
        </div>
      ) : allPreliminariesComplete ? (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          backgroundColor: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '14px',
        }}>
          All preliminary groups are complete. The Final Round Robin will be created automatically when the last match result is confirmed.
        </div>
      ) : (
        <div style={{
          marginTop: '15px',
          padding: '12px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          textAlign: 'center',
          fontSize: '13px',
          color: '#666',
        }}>
          Complete all preliminary groups to unlock the Final Round Robin.
        </div>
      )}
    </div>
  );
};

// ─── Schedule Panel ──────────────────────────────────────────────────────────
const PreliminaryWithFinalRoundRobinSchedulePanel: React.FC<TournamentScheduleProps> = ({
  tournament,
  isExpanded,
  onToggleExpand,
}) => {
  if (!isExpanded) return null;

  const children = tournament.childTournaments || [];
  const preliminaryGroups = children
    .filter(c => c.groupNumber !== null && c.groupNumber !== undefined)
    .sort((a, b) => (a.groupNumber ?? 0) - (b.groupNumber ?? 0));
  const finalTournament = children.find(c => c.groupNumber === null || c.groupNumber === undefined);

  return (
    <div style={{ padding: '10px' }}>
      {[...preliminaryGroups, ...(finalTournament ? [finalTournament] : [])].map(child => (
        <div key={child.id} style={{ marginBottom: '15px' }}>
          <h5 style={{ color: child.groupNumber != null ? '#3498db' : '#27ae60', marginBottom: '8px' }}>
            {child.name}
          </h5>
          {child.participants && child.participants.length > 0 ? (
            <div style={{ fontSize: '13px' }}>
              {child.matches?.map((match: any) => {
                const p1 = child.participants?.find((p: any) => p.memberId === match.member1Id);
                const p2 = child.participants?.find((p: any) => p.memberId === match.member2Id);
                const played = match.player1Sets > 0 || match.player2Sets > 0 || match.player1Forfeit || match.player2Forfeit;
                return (
                  <div key={match.id} style={{
                    padding: '4px 8px',
                    margin: '2px 0',
                    backgroundColor: played ? '#f0fff0' : '#f9f9f9',
                    borderRadius: '4px',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>
                      {p1 ? formatPlayerName(p1.member.firstName, p1.member.lastName, getNameDisplayOrder()) : '?'} vs{' '}
                      {p2 ? formatPlayerName(p2.member.firstName, p2.member.lastName, getNameDisplayOrder()) : '?'}
                    </span>
                    {played && (
                      <span style={{ fontWeight: 'bold' }}>
                        {match.player1Sets}-{match.player2Sets}
                        {match.player1Forfeit && ' (P1 forfeit)'}
                        {match.player2Forfeit && ' (P2 forfeit)'}
                      </span>
                    )}
                  </div>
                );
              })}
              {(!child.matches || child.matches.length === 0) && (
                <div style={{ color: '#999', fontStyle: 'italic' }}>No matches yet</div>
              )}
            </div>
          ) : (
            <div style={{ color: '#999', fontStyle: 'italic', fontSize: '13px' }}>Not yet created</div>
          )}
        </div>
      ))}
    </div>
  );
};

// ─── Completed Panel ─────────────────────────────────────────────────────────
const PreliminaryWithFinalRoundRobinCompletedPanel: React.FC<TournamentCompletedProps> = ({
  tournament,
  isExpanded,
}) => {
  if (!isExpanded) return null;

  const children = tournament.childTournaments || [];
  const preliminaryGroups = children
    .filter(c => c.groupNumber !== null && c.groupNumber !== undefined)
    .sort((a, b) => (a.groupNumber ?? 0) - (b.groupNumber ?? 0));
  const finalTournament = children.find(c => c.groupNumber === null || c.groupNumber === undefined);

  return (
    <div style={{ padding: '10px' }}>
      {/* Final results first */}
      {finalTournament && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#27ae60', marginBottom: '10px' }}>Final Round Robin Results</h4>
          <div style={{
            border: '2px solid #27ae60',
            borderRadius: '8px',
            padding: '12px',
            backgroundColor: '#f0fff0',
          }}>
            {finalTournament.participants && finalTournament.participants.length > 0 && (
              <div style={{ fontSize: '13px' }}>
                {finalTournament.participants
                  .sort((a: any, b: any) => (b.playerRatingAtTime ?? 0) - (a.playerRatingAtTime ?? 0))
                  .map((p: any, idx: number) => (
                    <div key={p.memberId} style={{
                      padding: '4px 8px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      backgroundColor: idx === 0 ? '#e8f5e9' : 'transparent',
                      borderRadius: '4px',
                    }}>
                      <span>
                        {idx + 1}. {formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())}
                      </span>
                      {p.playerRatingAtTime && (
                        <span style={{ color: '#666', fontWeight: 'bold' }}>{p.playerRatingAtTime}</span>
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preliminary group results */}
      <h4 style={{ marginBottom: '10px' }}>Preliminary Group Results</h4>
      {preliminaryGroups.map(group => (
        <div key={group.id} style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '10px',
          backgroundColor: '#fafafa',
        }}>
          <h5 style={{ margin: '0 0 8px 0', color: '#3498db' }}>{group.name}</h5>
          <div style={{ fontSize: '13px' }}>
            {group.participants
              ?.sort((a: any, b: any) => (b.playerRatingAtTime ?? 0) - (a.playerRatingAtTime ?? 0))
              .map((p: any, idx: number) => (
                <div key={p.memberId} style={{
                  padding: '3px 8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}>
                  <span>
                    {idx + 1}. {formatPlayerName(p.member.firstName, p.member.lastName, getNameDisplayOrder())}
                  </span>
                  {p.playerRatingAtTime && (
                    <span style={{ color: '#666' }}>{p.playerRatingAtTime}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Setup Panel (not used — creation goes through PostSelectionFlow) ────────
const PlaceholderSetupPanel: React.FC<TournamentSetupProps> = () => (
  <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
    Use the tournament creation wizard to set up this tournament type.
  </div>
);

// ─── Plugin Definition ───────────────────────────────────────────────────────
export const PreliminaryWithFinalRoundRobinPlugin: TournamentPlugin = {
  type: 'PRELIMINARY_WITH_FINAL_ROUND_ROBIN',
  isBasic: false,
  name: 'Preliminary + Final Round Robin',
  description: 'Preliminary round-robin groups followed by a final round-robin for top qualifiers',

  getCreationFlow: (): TournamentCreationFlow => ({
    minPlayers: 8,
    maxPlayers: -1,
    steps: [],
    renderPostSelectionFlow: (props) => (
      <PreliminaryWithFinalRoundRobinPostSelectionFlow {...props} />
    ),
  }),

  createSetupPanel: (props: TournamentSetupProps) => <PlaceholderSetupPanel {...props} />,

  validateSetup: (_data: any) => null,

  createTournament: async (_data: any) => {
    throw new Error('PRELIMINARY_WITH_FINAL_ROUND_ROBIN tournaments are created via the post-selection flow');
  },

  createActivePanel: (props: TournamentActiveProps) => (
    <PreliminaryWithFinalRoundRobinActivePanel {...props} />
  ),

  createSchedulePanel: (props: TournamentScheduleProps) => (
    <PreliminaryWithFinalRoundRobinSchedulePanel {...props} />
  ),

  createCompletedPanel: (props: TournamentCompletedProps) => (
    <PreliminaryWithFinalRoundRobinCompletedPanel {...props} />
  ),
};

export default PreliminaryWithFinalRoundRobinPlugin;
