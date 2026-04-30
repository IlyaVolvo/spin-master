import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RoundRobinActivePanel } from './RoundRobinActivePanel';

const duplicateMessage =
  'A result for this match has already been entered: One Player 3-1 Two Player. You may need to refresh the tournament to see the recorded score.';

vi.mock('../../../utils/auth', () => ({
  getMember: () => ({ id: 1 }),
  isOrganizer: () => true,
}));

vi.mock('../../../utils/nameFormatter', () => ({
  formatPlayerName: (firstName: string, lastName: string) => `${firstName} ${lastName}`,
  getNameDisplayOrder: () => 'firstLast',
}));

vi.mock('../utils/roundRobinMatchUpdater', () => ({
  createRoundRobinMatchUpdater: () => ({
    createMatch: async (_matchData: unknown, callbacks: { onError?: (message: string) => void }) => {
      callbacks.onError?.(duplicateMessage);
      throw new Error(duplicateMessage);
    },
    updateMatch: vi.fn(),
    deleteMatch: vi.fn(),
  }),
}));

function makeTournament() {
  const members = [
    { id: 1, firstName: 'One', lastName: 'Player', rating: 1200, birthDate: null, isActive: true },
    { id: 2, firstName: 'Two', lastName: 'Player', rating: 1100, birthDate: null, isActive: true },
  ];

  return {
    id: 10,
    name: 'Duplicate Flow Tournament',
    type: 'ROUND_ROBIN',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    recordedAt: new Date().toISOString(),
    participants: members.map((member, index) => ({
      id: index + 1,
      memberId: member.id,
      member,
      playerRatingAtTime: member.rating,
    })),
    matches: [],
  };
}

function DuplicateScoreHarness() {
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const tournament = makeTournament();

  return (
    <>
      <RoundRobinActivePanel
        tournament={tournament as any}
        onTournamentUpdate={vi.fn()}
        onMatchUpdate={vi.fn()}
        onError={(message) => {
          if (message.toLowerCase().includes('already been entered')) {
            setDuplicateWarning(message);
          }
        }}
        onSuccess={vi.fn()}
        suppressScoreEntry={!!duplicateWarning}
      />

      {duplicateWarning && (
        <div role="dialog" aria-label="Score already entered">
          <p>{duplicateWarning}</p>
          <button onClick={() => setDuplicateWarning(null)}>OK</button>
        </div>
      )}
    </>
  );
}

describe('duplicate score modal flow', () => {
  it('closes score entry before showing the duplicate warning and returns to active tournament view', async () => {
    render(<DuplicateScoreHarness />);

    expect(screen.getByText(/Progress: 0 \/ 1 matches played/i)).toBeInTheDocument();

    fireEvent.click(screen.getAllByTitle('Enter score')[0]);
    expect(screen.getByTitle('Scores cannot be equal')).toBeInTheDocument();
    const scoreInputs = screen.getAllByRole('spinbutton');
    fireEvent.change(scoreInputs[0], { target: { value: '3' } });
    fireEvent.change(scoreInputs[1], { target: { value: '1' } });

    fireEvent.click(screen.getByTitle('Enter Score & Complete Match'));

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'Score already entered' })).toBeInTheDocument();
    });
    expect(screen.queryByTitle('Enter Score & Complete Match')).not.toBeInTheDocument();
    expect(screen.getByText(duplicateMessage)).toBeInTheDocument();

    fireEvent.click(screen.getByText('OK'));

    expect(screen.queryByRole('dialog', { name: 'Score already entered' })).not.toBeInTheDocument();
    expect(screen.getByText(/Progress: 0 \/ 1 matches played/i)).toBeInTheDocument();
    expect(screen.queryByTitle('Enter Score & Complete Match')).not.toBeInTheDocument();
  });
});
