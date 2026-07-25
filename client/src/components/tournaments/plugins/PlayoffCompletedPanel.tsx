import React from 'react';
import { TournamentCompletedProps } from '../../../types/tournament';
import { PlayoffBracket } from './PlayoffBracket';
import { useScoreCorrectionModeActive } from '../../../contexts/ScoreCorrectionModeContext';
import { isOrganizer } from '../../../utils/auth';
import { ScoreCorrectionBanner } from '../../ScoreCorrectionBanner';
import { MatchEntryPopup, SCORE_CORRECTION_MODIFY_MESSAGE } from '../../MatchEntryPopup';
import { correctCompletedMatchScore } from '../../../utils/correctMatchScoreApi';
import {
  getCorrectionBannerText,
  tournamentCorrectionEligibility,
} from '../../../utils/scoreCorrectionUtils';

export const PlayoffCompletedPanel: React.FC<TournamentCompletedProps> = ({
  tournament,
  isExpanded,
  onTournamentUpdate,
  onError,
  onSuccess,
}) => {
  const organizer = isOrganizer();
  const eligibility = tournamentCorrectionEligibility(tournament);
  const correctionModeActive = useScoreCorrectionModeActive(tournament.status);
  const bannerText = getCorrectionBannerText(correctionModeActive, organizer, eligibility, tournament.status);
  const [editingMatch, setEditingMatch] = React.useState<{
    matchId: number;
    member1Id: number;
    member2Id: number;
    player1Sets: string;
    player2Sets: string;
    player1Forfeit: boolean;
    player2Forfeit: boolean;
    expectedMatchUpdatedAt?: string;
  } | null>(null);

  const handleSaveCorrection = async () => {
    if (!editingMatch) return;
    try {
      const dbMatch = tournament.matches.find(m => m.id === editingMatch.matchId);
      await correctCompletedMatchScore(tournament.id, editingMatch.matchId, {
        player1Sets: parseInt(editingMatch.player1Sets, 10) || 0,
        player2Sets: parseInt(editingMatch.player2Sets, 10) || 0,
        player1Forfeit: editingMatch.player1Forfeit,
        player2Forfeit: editingMatch.player2Forfeit,
        expectedMatchUpdatedAt: dbMatch?.updatedAt,
      });
      setEditingMatch(null);
      onSuccess?.('Score corrected successfully');
      onTournamentUpdate?.(tournament);
    } catch (err: any) {
      onError?.(err?.response?.data?.error || err?.message || 'Failed to correct score');
    }
  };

  if (!isExpanded) {
    return null;
  }

  return (
    <div className="playoff-completed expanded">
      <ScoreCorrectionBanner
        message={bannerText}
        allowed={Boolean(eligibility?.allowed)}
      />
      <PlayoffBracket
        tournamentId={tournament.id}
        participants={tournament.participants as any}
        matches={(tournament.bracketMatches || []) as any}
        isReadOnly={true}
        tournamentStatus="COMPLETED"
        cancelled={tournament.cancelled}
        scoreCorrectionActive={correctionModeActive}
        correctionEligibility={eligibility}
        onCorrectionMatchSelect={setEditingMatch}
      />
      {editingMatch && (() => {
        const p1 = tournament.participants.find(p => p.memberId === editingMatch.member1Id)?.member;
        const p2 = tournament.participants.find(p => p.memberId === editingMatch.member2Id)?.member;
        if (!p1 || !p2) return null;
        return (
          <MatchEntryPopup
            editingMatch={editingMatch}
            player1={p1}
            player2={p2}
            showForfeitOptions
            requireScorePins={false}
            onSetEditingMatch={setEditingMatch}
            onSave={handleSaveCorrection}
            onCancel={() => setEditingMatch(null)}
            modifyConfirmationMessage={SCORE_CORRECTION_MODIFY_MESSAGE}
          />
        );
      })()}
    </div>
  );
};
