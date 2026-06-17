import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { UserContext } from '../../UserContext';

import SearchPanel from './SearchPanel';

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: ({ value, onChange, onFocus, onBlur }) => (
    <input
      aria-label="Chercher une chanson"
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  ),
}));

jest.mock('./Search', () => ({
  __esModule: true,
  default: ({ visible }) => <div data-testid="search-results">{visible ? 'visible' : 'hidden'}</div>,
}));

jest.mock('./RecentlyPlayed', () => ({
  __esModule: true,
  default: ({ visible, provider }) => (
    <div data-testid="recently-played">{visible ? `visible:${provider}` : 'hidden'}</div>
  ),
}));

function renderSearchPanel() {
  window.localStorage.clear();
  return render(
    <UserContext.Provider
      value={{
        user: {
          id: 1,
          provider_connections: {
            spotify: { connected: true, access_token: 'token' },
          },
        },
      }}
    >
      <SearchPanel onSelectSong={jest.fn()} />
    </UserContext.Provider>
  );
}

describe('SearchPanel', () => {
  test('shows RecentlyPlayed when the search bar is empty, unfocused and a personalized provider is selected', () => {
    renderSearchPanel();

    expect(screen.getByTestId('recently-played')).toHaveTextContent('visible:spotify');
  });

  test('hides RecentlyPlayed while the empty search bar is focused', () => {
    renderSearchPanel();

    fireEvent.focus(screen.getByLabelText('Chercher une chanson'));

    expect(screen.getByTestId('recently-played')).toHaveTextContent('hidden');

    fireEvent.blur(screen.getByLabelText('Chercher une chanson'));

    expect(screen.getByTestId('recently-played')).toHaveTextContent('visible:spotify');
  });

  test('hides RecentlyPlayed when the search bar contains text', () => {
    renderSearchPanel();

    fireEvent.change(screen.getByLabelText('Chercher une chanson'), { target: { value: 'Daft Punk' } });

    expect(screen.getByTestId('recently-played')).toHaveTextContent('hidden');
    expect(screen.getByTestId('search-results')).toHaveTextContent('visible');
  });
});
