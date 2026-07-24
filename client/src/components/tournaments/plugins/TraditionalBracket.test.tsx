import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TraditionalBracket } from './TraditionalBracket';
import { MATCH_RESULT_ALREADY_ENTERED_MESSAGE } from '../../../utils/duplicateScoreError';

vi.mock('../../../utils/auth', () => ({
  getMember: () => ({ id: 1 }),
  isOrganizer: () => true,
  isKioskMode: () => false,
}));

vi.mock('../../../utils/systemConfig', () => ({
  getSystemConfig: () => ({
    tournamentRules: {
      matchScore: {
        min: 0,
        max: 7,
        allowEqualScores: false,
      },
      playoff: {
        minPlayers: 2,
        seedDivisor: 4,
      },
    },
  }),
  subscribeToSystemConfig: () => () => undefined,
}));

vi.mock('../../../utils/nameFormatter', () => ({
  formatPlayerName: (firstName: string, lastName: string) => `${firstName} ${lastName}`,
  getNameDisplayOrder: () => 'firstLast',
}));

vi.mock('../../../utils/api', () => ({
  default: {
    delete: vi.fn(),
    patch: vi.fn(),
  },
}));

const participants = [
  {
    id: 1,
    member: { id: 1, firstName: 'One', lastName: 'Player', rating: 1200 },
    playerRatingAtTime: 1200,
  },
  {
    id: 2,
    member: { id: 2, firstName: 'Two', lastName: 'Player', rating: 1100 },
    playerRatingAtTime: 1100,
  },
];

describe('TraditionalBracket match editing', () => {
  it('shows remove option for an editable playoff result', () => {
    render(
      <TraditionalBracket
        tournamentId={10}
        participants={participants}
        matches={[
          {
            id: 201,
            round: 1,
            position: 1,
            player1Id: 1,
            player2Id: 2,
            player1IsBye: false,
            player2IsBye: false,
            matchId: 101,
            nextMatchId: 202,
            player1Sets: 3,
            player2Sets: 1,
            match: {
              id: 101,
              player1RatingBefore: null,
              player1RatingChange: null,
              player2RatingBefore: null,
              player2RatingChange: null,
            },
          },
          {
            id: 202,
            round: 2,
            position: 1,
            player1Id: 1,
            player2Id: null,
            player1IsBye: false,
            player2IsBye: false,
            match: null,
          },
        ]}
      />
    );

    fireEvent.contextMenu(screen.getByTitle('Right-click or long-press to modify/remove result'));

    expect(screen.getByText('Clear Result')).toBeInTheDocument();
  });

  it('closes score entry and reports duplicate warning when a result appears before save', () => {
    const onError = vi.fn();
    const { rerender } = render(
      <TraditionalBracket
        tournamentId={10}
        participants={participants}
        matches={[
          {
            id: 201,
            round: 1,
            position: 1,
            player1Id: 1,
            player2Id: 2,
            player1IsBye: false,
            player2IsBye: false,
            match: null,
          },
        ]}
        onError={onError}
      />
    );

    fireEvent.click(screen.getAllByTitle('Enter score')[0]);
    const player1Input = screen.getByLabelText('Player 1 score');
    const player2Input = screen.getByLabelText('Player 2 score');
    fireEvent.keyDown(player1Input, { key: '3' });
    fireEvent.keyDown(player2Input, { key: '1' });

    rerender(
      <TraditionalBracket
        tournamentId={10}
        participants={participants}
        matches={[
          {
            id: 201,
            round: 1,
            position: 1,
            player1Id: 1,
            player2Id: 2,
            player1IsBye: false,
            player2IsBye: false,
            matchId: 101,
            player1Sets: 3,
            player2Sets: 1,
            match: {
              id: 101,
              player1RatingBefore: null,
              player1RatingChange: null,
              player2RatingBefore: null,
              player2RatingChange: null,
            },
          },
        ]}
        onError={onError}
      />
    );

    fireEvent.click(screen.getByTitle('Enter Score & Complete Match'));

    expect(onError).toHaveBeenCalledWith(MATCH_RESULT_ALREADY_ENTERED_MESSAGE);
    expect(screen.queryByTitle('Enter Score & Complete Match')).not.toBeInTheDocument();
  });
});
