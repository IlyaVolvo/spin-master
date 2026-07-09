import { useState, type MouseEvent } from 'react';
import { useScoreCorrectionModeActive } from '../contexts/ScoreCorrectionModeContext';
import { isOrganizer } from '../utils/auth';
import { correctCompletedMatchScore } from '../utils/correctMatchScoreApi';
import api from '../utils/api';
import {
  getCorrectionBannerText,
  isMatchCorrectable,
  shouldOpenCorrectionEditor,
  tournamentCorrectionEligibility,
} from '../utils/scoreCorrectionUtils';
import type { Tournament } from '../types/tournament';

export interface ScoreCorrectionEditingMatch {
  matchId: number;
  member1Id: number;
  member2Id: number;
  player1Sets: string;
  player2Sets: string;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  expectedMatchUpdatedAt?: string;
}

interface ScoreCorrectionPanelCallbacks {
  onTournamentUpdate?: (tournament: Tournament) => void;
  onError?: (error: string) => void;
  onSuccess?: (message: string) => void;
  /** Active tournaments: open regular match editor (PATCH) instead of correction API. */
  onActiveMatchEdit?: (match: ScoreCorrectionEditingMatch) => void;
}

export function useScoreCorrectionPanel(
  tournament: Tournament,
  callbacks: ScoreCorrectionPanelCallbacks,
) {
  const organizer = isOrganizer();
  const eligibility = tournamentCorrectionEligibility(tournament);
  const correctionModeActive = useScoreCorrectionModeActive(tournament.status);
  const bannerText = getCorrectionBannerText(correctionModeActive, organizer, eligibility, tournament.status);
  const [correctionEditingMatch, setCorrectionEditingMatch] = useState<ScoreCorrectionEditingMatch | null>(null);

  const openModificationEditor = (
    match: {
      id: number;
      member1Id: number;
      member2Id: number | null;
      player1Sets?: number;
      player2Sets?: number;
      player1Forfeit?: boolean;
      player2Forfeit?: boolean;
      updatedAt?: string;
    },
    event?: MouseEvent,
  ) => {
    if (!shouldOpenCorrectionEditor(correctionModeActive, match.id, eligibility)) return;
    event?.preventDefault();
    event?.stopPropagation();
    const payload: ScoreCorrectionEditingMatch = {
      matchId: match.id,
      member1Id: match.member1Id,
      member2Id: match.member2Id ?? 0,
      player1Sets: String(match.player1Sets ?? 0),
      player2Sets: String(match.player2Sets ?? 0),
      player1Forfeit: match.player1Forfeit || false,
      player2Forfeit: match.player2Forfeit || false,
      expectedMatchUpdatedAt: match.updatedAt,
    };
    if (tournament.status === 'COMPLETED') {
      setCorrectionEditingMatch(payload);
    } else {
      callbacks.onActiveMatchEdit?.(payload);
    }
  };

  const handleSaveCorrection = async () => {
    if (!correctionEditingMatch) return;
    try {
      await correctCompletedMatchScore(tournament.id, correctionEditingMatch.matchId, {
        player1Sets: parseInt(correctionEditingMatch.player1Sets, 10) || 0,
        player2Sets: parseInt(correctionEditingMatch.player2Sets, 10) || 0,
        player1Forfeit: correctionEditingMatch.player1Forfeit,
        player2Forfeit: correctionEditingMatch.player2Forfeit,
        expectedMatchUpdatedAt: correctionEditingMatch.expectedMatchUpdatedAt,
      });
      setCorrectionEditingMatch(null);
      callbacks.onSuccess?.('Score corrected successfully');
      try {
        const response = await api.get(`/tournaments/${tournament.id}`);
        callbacks.onTournamentUpdate?.(response.data);
      } catch {
        callbacks.onTournamentUpdate?.(tournament);
      }
    } catch (err: any) {
      callbacks.onError?.(err?.response?.data?.error || err?.message || 'Failed to correct score');
    }
  };

  return {
    organizer,
    eligibility,
    correctionModeActive,
    bannerText,
    correctionEditingMatch,
    setCorrectionEditingMatch,
    openModificationEditor,
    /** @deprecated Use openModificationEditor */
    openCorrectionEditor: openModificationEditor,
    handleSaveCorrection,
  };
}
