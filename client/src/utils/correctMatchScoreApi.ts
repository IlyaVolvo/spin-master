import api from './api';

export interface CorrectMatchPayload {
  player1Sets: number;
  player2Sets: number;
  player1Forfeit: boolean;
  player2Forfeit: boolean;
  expectedMatchUpdatedAt?: string;
}

export async function correctCompletedMatchScore(
  tournamentId: number,
  matchId: number,
  payload: CorrectMatchPayload,
) {
  const response = await api.patch(`/tournaments/${tournamentId}/matches/${matchId}/correct`, payload);
  return response.data;
}
