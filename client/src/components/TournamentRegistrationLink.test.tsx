import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import TournamentRegistrationLink from './TournamentRegistrationLink';
import api from '../utils/api';

vi.mock('../utils/api', () => ({
  default: {
    post: vi.fn(),
  },
}));

function renderLink(code = 'abc123') {
  return render(
    <MemoryRouter initialEntries={[`/tournament-registration/${code}`]}>
      <Routes>
        <Route path="/tournament-registration/:code" element={<TournamentRegistrationLink />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('TournamentRegistrationLink', () => {
  it('registers by code and shows the server success message', async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { message: 'Registered successfully.' } });

    renderLink('code-value');

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith('/tournaments/register/code-value');
    });
    expect(await screen.findByText('Registered successfully.')).toBeInTheDocument();
  });

  it('shows a rejection message from the server', async () => {
    vi.mocked(api.post).mockRejectedValueOnce({
      response: { data: { error: 'The registration deadline has passed.' } },
    });

    renderLink();

    expect(await screen.findByText('The registration deadline has passed.')).toBeInTheDocument();
  });
});
