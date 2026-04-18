import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import AddReactionModal from './AddReactionModal';
import { UserContext } from '../UserContext';

jest.mock('../Security/TokensUtils', () => ({
  getCookie: jest.fn(() => 'csrftoken'),
}));

jest.mock('../Auth/AuthFlow', () => ({
  buildRelativeLocation: jest.fn(() => '/flowbox/box-a/discover'),
  clearAuthReturnContext: jest.fn(),
  saveAuthReturnContext: jest.fn(),
}));

function renderModal() {
  return render(
    <MemoryRouter>
      <UserContext.Provider value={{ user: { id: 1, is_guest: false }, setUser: jest.fn() }}>
        <AddReactionModal
          open
          onClose={jest.fn()}
          depPublicKey="dep-1"
          currentEmoji={null}
          onApplied={jest.fn()}
          setUser={jest.fn()}
          viewer={{ id: 1, is_guest: false }}
        />
      </UserContext.Provider>
    </MemoryRouter>
  );
}

describe('AddReactionModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          actives_paid: [{ id: 12, char: '🔥', cost: 300 }],
          owned_ids: [],
          current_reaction: null,
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ code: 'INSUFFICIENT_POINTS', points_balance: 12 }),
      });
  });

  test('opens points dialog when emoji purchase is refused for insufficient points', async () => {
    renderModal();

    const emojiButton = await screen.findByRole('button', { name: /🔥/i });
    fireEvent.click(emojiButton);
    fireEvent.click(await screen.findByRole('button', { name: 'Débloquer' }));

    expect(await screen.findByText('Tu n’as assez de points pour débloquer cet émoji. Les dépôts te font gagner des points.')).toBeInTheDocument();
  });
});
