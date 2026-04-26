import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MatchEntryPopup, RATING_IMPACT_MODIFY_MESSAGE } from './MatchEntryPopup';

vi.mock('../utils/nameFormatter', () => ({
  formatPlayerName: (firstName: string, lastName: string) => `${firstName} ${lastName}`,
  getNameDisplayOrder: () => 'firstLast',
}));

const player1 = { id: 1, firstName: 'One', lastName: 'Player' };
const player2 = { id: 2, firstName: 'Two', lastName: 'Player' };

function renderPopup(overrides: Partial<React.ComponentProps<typeof MatchEntryPopup>> = {}) {
  const props: React.ComponentProps<typeof MatchEntryPopup> = {
    editingMatch: {
      matchId: 10,
      member1Id: 1,
      member2Id: 2,
      player1Sets: '3',
      player2Sets: '1',
      player1Forfeit: false,
      player2Forfeit: false,
      opponentPassword: '',
    },
    player1,
    player2,
    onSetEditingMatch: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onClear: vi.fn(),
    showClearButton: true,
    ...overrides,
  };
  function Wrapper() {
    const [editingMatch, setEditingMatch] = useState(props.editingMatch);
    return (
      <MatchEntryPopup
        {...props}
        editingMatch={editingMatch}
        onSetEditingMatch={(next) => {
          props.onSetEditingMatch(next);
          setEditingMatch(next);
        }}
      />
    );
  }
  render(<Wrapper />);
  return props;
}

describe('MatchEntryPopup modification confirmations', () => {
  it('saves an existing result without confirmation when the winner does not change', () => {
    const props = renderPopup();

    fireEvent.click(screen.getByTitle('Save Changes'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onSave).toHaveBeenCalled();
  });

  it('uses an in-app confirmation before saving an existing result when the winner changes', () => {
    const props = renderPopup();

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.click(screen.getByTitle('Save Changes'));

    expect(screen.getByRole('dialog', { name: 'Modify Match Result' })).toBeInTheDocument();
    expect(screen.getByText('Modify this match result? This will update the recorded score.')).toBeInTheDocument();
    expect(screen.queryByText(/ratings may be adjusted/i)).not.toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Modify Result'));
    expect(props.onSave).toHaveBeenCalled();
  });

  it('can show rating-impact wording for playoff and swiss callers', () => {
    renderPopup({ modifyConfirmationMessage: RATING_IMPACT_MODIFY_MESSAGE });

    const inputs = screen.getAllByRole('spinbutton');
    fireEvent.change(inputs[0], { target: { value: '1' } });
    fireEvent.change(inputs[1], { target: { value: '3' } });
    fireEvent.click(screen.getByTitle('Save Changes'));

    expect(screen.getByText(RATING_IMPACT_MODIFY_MESSAGE)).toBeInTheDocument();
  });

  it('saves a new result without modification confirmation', () => {
    const props = renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '3',
        player2Sets: '1',
        player1Forfeit: false,
        player2Forfeit: false,
      },
      showClearButton: false,
    });

    fireEvent.click(screen.getByTitle('Enter Score & Complete Match'));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(props.onSave).toHaveBeenCalled();
  });

  it('uses an in-app confirmation before clearing a result', () => {
    const props = renderPopup();

    fireEvent.click(screen.getByText('Clear Result'));

    expect(screen.getByRole('dialog', { name: 'Remove Match Result' })).toBeInTheDocument();
    expect(props.onClear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Remove Result'));
    expect(props.onClear).toHaveBeenCalled();
  });
});
