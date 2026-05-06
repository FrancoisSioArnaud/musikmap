import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { UserContext } from '../UserContext';

import Onboarding from './Onboarding';
import { FlowboxSessionContext } from './runtime/FlowboxSessionContext';

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="current-path">{location.pathname}</span>;
}

function renderOnboarding({ flowboxContext = {}, userContext = {} } = {}) {
  const saveVerifiedSession = jest.fn();
  const markFlowboxVisited = jest.fn();
  const setUser = jest.fn();
  const contextValue = {
    getBoxRuntime: jest.fn(() => ({
      box: {
        slug: 'box-a',
        name: 'Box A',
        lastDepositSongImageUrl: null,
        lastDepositDate: null,
      },
    })),
    getActiveSessionForSlug: jest.fn(() => null),
    sessionLoadStateBySlug: {},
    saveVerifiedSession,
    markFlowboxVisited,
    ...flowboxContext,
  };
  const userContextValue = { user: null, setUser, ...userContext };

  const rendered = render(
    <MemoryRouter initialEntries={['/flowbox/box-a']}>
      <UserContext.Provider value={userContextValue}>
        <FlowboxSessionContext.Provider value={contextValue}>
          <LocationProbe />
          <Routes>
            <Route path="/flowbox/:boxSlug" element={<Onboarding />} />
            <Route path="/flowbox/:boxSlug/discover" element={<div>Discover route</div>} />
            <Route path="/legacy-search-sentinel" element={<div>Search route</div>} />
          </Routes>
        </FlowboxSessionContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>
  );

  return { ...rendered, saveVerifiedSession, markFlowboxVisited, setUser };
}

function mockLocationApis() {
  const originalPermissions = navigator.permissions;
  const originalGeolocation = navigator.geolocation;

  Object.defineProperty(navigator, 'permissions', {
    configurable: true,
    value: { query: jest.fn().mockResolvedValue({ state: 'granted' }) },
  });
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: jest.fn((success) => success({
        coords: { latitude: 47.2184, longitude: -1.5536 },
      })),
    },
  });

  return () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: originalPermissions,
    });
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  };
}

describe('Onboarding Flowbox entry', () => {
  let restoreLocationApis;

  beforeEach(() => {
    jest.clearAllMocks();
    document.cookie = 'csrftoken=csrf-token';
    restoreLocationApis = mockLocationApis();
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        active: true,
        box: { slug: 'box-a', name: 'Box A' },
        session: { active: true, remaining_seconds: 1200 },
        current_user: { username: 'viewer', points: 50 },
      }),
    });
  });

  afterEach(() => {
    restoreLocationApis?.();
  });

  test('navigates to Discover after verify-location succeeds and never to search', async () => {
    const { saveVerifiedSession, markFlowboxVisited, setUser } = renderOnboarding();

    fireEvent.click(screen.getByRole('button', { name: 'Commencer' }));

    expect(await screen.findByText('Discover route')).toBeInTheDocument();
    expect(screen.queryByText('Search route')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/flowbox/box-a/discover');
    expect(global.fetch).toHaveBeenCalledWith(
      '/box-management/verify-location',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ boxSlug: 'box-a', latitude: 47.2184, longitude: -1.5536 }),
      })
    );
    await waitFor(() => {
      expect(saveVerifiedSession).toHaveBeenCalledWith(
        expect.objectContaining({ active: true }),
        { triggerEnterHint: true }
      );
    });
    expect(markFlowboxVisited).toHaveBeenCalledWith('box-a');
    expect(setUser).toHaveBeenCalledWith({ username: 'viewer', points: 50 });
  });
});
