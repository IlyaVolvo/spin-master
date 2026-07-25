import { fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MatchEntryPopup, RATING_IMPACT_MODIFY_MESSAGE } from './MatchEntryPopup';

vi.mock('../utils/nameFormatter', () => ({
  formatPlayerName: (firstName: string, lastName: string) => `${firstName} ${lastName}`,
  getNameDisplayOrder: () => 'firstLast',
}));

vi.mock('../utils/auth', () => ({
  getMember: () => ({ id: 1 }),
  isOrganizer: () => true,
  isKioskMode: () => false,
}));

vi.mock('../utils/systemConfig', () => ({
  getSystemConfig: () => ({
    tournamentRules: {
      matchScore: {
        min: 1,
        max: 7,
        allowEqualScores: false,
      },
    },
  }),
  subscribeToSystemConfig: () => () => undefined,
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
      member1Pin: '',
        member2Pin: '',
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

function getScoreInputs() {
  return [
    screen.getByLabelText('Player 1 score'),
    screen.getByLabelText('Player 2 score'),
  ] as HTMLInputElement[];
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

    const [player1Input, player2Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: '1' });
    fireEvent.keyDown(player2Input, { key: '3' });
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

    const [player1Input, player2Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: '1' });
    fireEvent.keyDown(player2Input, { key: '3' });
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

  it('treats an unplayed generated match row as first result entry', () => {
    const props = renderPopup({
      editingMatch: {
        matchId: 25,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '3',
        player2Sets: '1',
        player1Forfeit: false,
        player2Forfeit: false,
        expectedHadResult: false,
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

describe('MatchEntryPopup keyboard entry', () => {
  it('focuses player 1 score on open', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '0',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    expect(getScoreInputs()[0]).toHaveFocus();
  });

  it('typing in player 1 clears player 2 and sets player 1', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '3',
        player2Sets: '1',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    const [player1Input, player2Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: '2' });

    expect(player1Input).toHaveValue('2');
    expect(player2Input).toHaveValue('0');
  });

  it('typing in player 2 only replaces player 2', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '3',
        player2Sets: '1',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    const [player1Input, player2Input] = getScoreInputs();
    fireEvent.keyDown(player2Input, { key: '2' });

    expect(player1Input).toHaveValue('3');
    expect(player2Input).toHaveValue('2');
  });

  it('tab moves focus from player 1 to player 2', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '0',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    const [player1Input, player2Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: 'Tab' });

    expect(player2Input).toHaveFocus();
  });

  it('enter saves and escape cancels', () => {
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

    const [player1Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: 'Enter' });
    expect(props.onSave).toHaveBeenCalled();

    fireEvent.keyDown(player1Input, { key: 'Escape' });
    expect(props.onCancel).toHaveBeenCalled();
  });

  it('arrow keys increment and decrement the focused score within bounds', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '2',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    const [player1Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    expect(player1Input).toHaveValue('3');

    fireEvent.keyDown(player1Input, { key: 'ArrowDown' });
    fireEvent.keyDown(player1Input, { key: 'ArrowDown' });
    expect(player1Input).toHaveValue('1');

    fireEvent.keyDown(player1Input, { key: 'ArrowDown' });
    fireEvent.keyDown(player1Input, { key: 'ArrowDown' });
    expect(player1Input).toHaveValue('0');

    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    fireEvent.keyDown(player1Input, { key: 'ArrowUp' });
    expect(player1Input).toHaveValue('7');
  });

  it('tab cycles only between score inputs', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '0',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    const [player1Input, player2Input] = getScoreInputs();
    fireEvent.keyDown(player1Input, { key: 'Tab' });
    expect(player2Input).toHaveFocus();

    fireEvent.keyDown(player2Input, { key: 'Tab' });
    expect(player1Input).toHaveFocus();

    fireEvent.keyDown(player1Input, { key: 'Tab', shiftKey: true });
    expect(player2Input).toHaveFocus();
  });

  it('enter on either score field completes the match', () => {
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

    const [, player2Input] = getScoreInputs();
    fireEvent.keyDown(player2Input, { key: 'Enter' });
    expect(props.onSave).toHaveBeenCalled();
  });

  it('stepper buttons are not in the tab order', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '0',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    expect(screen.getByRole('button', { name: 'Increase player 1 score' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('button', { name: 'Decrease player 2 score' })).toHaveAttribute('tabindex', '-1');
  });

  it('stepper buttons increment and decrement within bounds', () => {
    renderPopup({
      editingMatch: {
        matchId: 0,
        member1Id: 1,
        member2Id: 2,
        player1Sets: '2',
        player2Sets: '0',
        player1Forfeit: false,
        player2Forfeit: false,
      },
    });

    const [player1Input] = getScoreInputs();
    fireEvent.click(screen.getByRole('button', { name: 'Increase player 1 score' }));
    expect(player1Input).toHaveValue('3');

    fireEvent.click(screen.getByRole('button', { name: 'Decrease player 1 score' }));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease player 1 score' }));
    expect(player1Input).toHaveValue('1');

    fireEvent.click(screen.getByRole('button', { name: 'Decrease player 1 score' }));
    expect(player1Input).toHaveValue('0');
    expect(screen.getByRole('button', { name: 'Decrease player 1 score' })).toBeDisabled();

    for (let i = 0; i < 7; i += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Increase player 1 score' }));
    }
    expect(player1Input).toHaveValue('7');
    expect(screen.getByRole('button', { name: 'Increase player 1 score' })).toBeDisabled();
  });
});
