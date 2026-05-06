import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { UserContext } from '../UserContext';

import Discover from './Discover';
import { FlowboxSessionContext } from './runtime/FlowboxSessionContext';

jest.mock('../Common/Deposit', () => ({
  __esModule: true,
  default: ({ dep, variant }) => <div data-testid={`deposit-${variant}`}>{dep?.public_key || ''}</div>,
}));

jest.mock('../Common/Search/SearchPanel', () => ({
  __esModule: true,
  default: ({ onSelectSong }) => (
    <button
      type="button"
      onClick={() => onSelectSong({ id: 'track-1', name: 'Posted song', artist: 'Artist', image_url: 'cover.jpg' }, 'request-1')}
    >
      Choisir Posted song
    </button>
  ),
}));

jest.mock('../Security/TokensUtils', () => ({
  getCookie: jest.fn(() => 'csrf-token'),
}));

jest.mock('./PinnedSongSection', () => ({
  __esModule: true,
  default: () => <div data-testid="pinned-section" />,
}));

jest.mock('../Common/Article/ArticleCard', () => ({
  __esModule: true,
  default: ({ article }) => <article data-testid="article-card">{article?.title}</article>,
}));

jest.mock('../Common/Article/ArticleDrawer', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('./AchievementsPanel', () => ({
  __esModule: true,
  default: () => <div data-testid="achievements-panel" />,
}));


function LocationProbe() {
  const location = useLocation();
  return <span data-testid="current-path">{`${location.pathname}${location.search}`}</span>;
}

function renderDiscover(contextOverrides = {}, userContextOverrides = {}) {
  const contextValue = {
    getDiscoverSnapshot: jest.fn(() => null),
    saveDiscoverSnapshot: jest.fn(),
    patchDiscoverSnapshot: jest.fn(),
    clearBoxSession: jest.fn(),
    ...contextOverrides,
  };
  const userContextValue = {
    user: { username: 'viewer', points: 100 },
    setUser: jest.fn(),
    ...userContextOverrides,
  };

  const rendered = render(
    <MemoryRouter initialEntries={["/flowbox/box-a/discover"]}>
      <UserContext.Provider value={userContextValue}>
        <FlowboxSessionContext.Provider value={contextValue}>
          <LocationProbe />
          <Routes>
            <Route path="/flowbox/:boxSlug/discover" element={<Discover />} />
            <Route path="/legacy-search-sentinel" element={<div>Search route</div>} />
            <Route path="/flowbox/:boxSlug/closed" element={<div>Closed route</div>} />
          </Routes>
        </FlowboxSessionContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>
  );

  return { ...rendered, contextValue, userContextValue };
}

function mockFetch({
  boxContent,
  boxContentStatus = 200,
  articles = [],
  depositResponse = null,
  depositStatus = 200,
  olderDepositsResponse = null,
  olderDepositsStatus = 200,
}) {
  global.fetch = jest.fn(async (url) => {
    if (String(url).includes('/box-management/box-content/')) {
      return {
        ok: boxContentStatus >= 200 && boxContentStatus < 300,
        status: boxContentStatus,
        json: async () => boxContent,
      };
    }

    if (String(url).includes('/box-management/articles/visible/')) {
      return {
        ok: true,
        status: 200,
        json: async () => articles,
      };
    }

    if (String(url).includes('/box-management/box-deposit/')) {
      return {
        ok: depositStatus >= 200 && depositStatus < 300,
        status: depositStatus,
        json: async () => depositResponse,
      };
    }

    if (String(url).includes('/box-management/box-older-deposits/')) {
      return {
        ok: olderDepositsStatus >= 200 && olderDepositsStatus < 300,
        status: olderDepositsStatus,
        json: async () => olderDepositsResponse,
      };
    }

    throw new Error(`Unexpected fetch ${url}`);
  });
}

function expectNodeBefore(first, second) {
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('Discover', () => {
  let intersectionObservers = [];

  beforeEach(() => {
    jest.clearAllMocks();
    intersectionObservers = [];
    delete window.IntersectionObserver;
  });

  function mockIntersectionObserver() {
    window.IntersectionObserver = jest.fn((callback) => {
      const observer = {
        observe: jest.fn(),
        disconnect: jest.fn(),
        trigger: (isIntersecting = true) => callback([{ isIntersecting }]),
      };
      intersectionObservers.push(observer);
      return observer;
    });
  }

  test('loads box-content when no local snapshot exists and does not redirect to search', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: { public_key: 'pin-1' },
        my_deposit: null,
      },
    });

    const { contextValue } = renderDiscover();

    expect(await screen.findByTestId('deposit-main')).toHaveTextContent('main-1');
    expect(screen.queryByText('Search route')).not.toBeInTheDocument();
    expect(screen.getByTestId('current-path')).toHaveTextContent('/flowbox/box-a/discover');
    expect(global.fetch).toHaveBeenCalledWith(
      '/box-management/box-content/?boxSlug=box-a',
      expect.any(Object)
    );
    expect(contextValue.saveDiscoverSnapshot).toHaveBeenCalledWith(
      'box-a',
      expect.objectContaining({
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        olderDeposits: [{ public_key: 'older-1' }],
        olderDepositsNextCursor: '2026-05-06T20:00:00.000000+00:00|123',
        olderDepositsHasMore: true,
        activePinnedDeposit: { public_key: 'pin-1' },
        myDeposit: null,
        successes: [],
        pointsBalance: null,
      })
    );
  });

  test('uses local snapshot without loading box-content', async () => {
    mockFetch({ boxContent: {} });

    renderDiscover({
      getDiscoverSnapshot: jest.fn(() => ({
        boxSlug: 'box-a',
        loadedAt: '2026-05-06T10:00:00.000Z',
        main: { public_key: 'cached-main' },
        olderDeposits: [],
        activePinnedDeposit: null,
        myDeposit: null,
        successes: [],
        pointsBalance: null,
      })),
    });

    expect(await screen.findByTestId('deposit-main')).toHaveTextContent('cached-main');
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining('/box-management/box-content/'),
      expect.any(Object)
    );
  });

  test('places LiveSearchSection after main deposit and before articles', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [],
        active_pinned_deposit: null,
        my_deposit: null,
      },
      articles: [{ id: 1, title: 'Article vivant' }],
    });

    renderDiscover();

    const mainDeposit = await screen.findByTestId('deposit-main');
    const liveSearchHeading = screen.getByRole('heading', {
      name: /Partage une chanson pour gagner des points/i,
      level: 3,
    });
    const article = await screen.findByTestId('article-card');

    expectNodeBefore(mainDeposit, liveSearchHeading);
    expectNodeBefore(liveSearchHeading, article);
  });

  test('keeps LiveSearchSection readable when main deposit is empty', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: null,
        older_deposits: [],
        active_pinned_deposit: null,
        my_deposit: null,
      },
      articles: [{ id: 1, title: 'Article vivant' }],
    });

    renderDiscover();

    const emptyState = await screen.findByText(/Aucune chanson à découvrir/i);
    const liveSearchHeading = screen.getByRole('heading', {
      name: /Partage une chanson pour gagner des points/i,
      level: 3,
    });
    const article = await screen.findByTestId('article-card');

    expectNodeBefore(emptyState, liveSearchHeading);
    expectNodeBefore(liveSearchHeading, article);
  });

  test('patches local state and snapshot after a session deposit without reloading box-content', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        active_pinned_deposit: { public_key: 'pin-1' },
        my_deposit: null,
      },
      depositResponse: {
        my_deposit: {
          public_key: 'my-deposit-1',
          song: { title: 'Posted song', artist: 'Artist', image_url: 'cover.jpg' },
        },
        successes: [{ name: 'total', points: 25 }],
        points_balance: 125,
        already_exists: false,
      },
    });
    const patchDiscoverSnapshot = jest.fn();

    renderDiscover({ patchDiscoverSnapshot });

    expect(await screen.findByTestId('deposit-main')).toHaveTextContent('main-1');
    expect(await screen.findByText('older-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Posted song' }));

    expect(await screen.findByText('Chanson déposée avec succès')).toBeInTheDocument();
    expect(screen.getByText('Posted song')).toBeInTheDocument();
    expect(screen.getByTestId('deposit-main')).toHaveTextContent('main-1');
    expect(screen.getByText('older-1')).toBeInTheDocument();
    expect(screen.queryByText(/Aucune chanson à découvrir/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager une chanson' })).not.toBeInTheDocument();

    expect(patchDiscoverSnapshot).toHaveBeenCalledWith(
      'box-a',
      expect.objectContaining({
        boxSlug: 'box-a',
        myDeposit: expect.objectContaining({ public_key: 'my-deposit-1' }),
        successes: [{ name: 'total', points: 25 }],
        pointsBalance: 125,
      })
    );
    const patchedSnapshot = patchDiscoverSnapshot.mock.calls[0][1];
    expect(patchedSnapshot).not.toHaveProperty('main');
    expect(patchedSnapshot).not.toHaveProperty('olderDeposits');
    expect(patchedSnapshot).not.toHaveProperty('activePinnedDeposit');
    expect(patchedSnapshot).not.toMatchObject({
      main: null,
      olderDeposits: [],
      activePinnedDeposit: null,
    });
    expect(global.fetch.mock.calls.filter(([url]) => String(url).includes('/box-management/box-content/'))).toHaveLength(1);
  });


  test('scroll loads older deposits next page, appends without duplicates and patches snapshot', async () => {
    mockIntersectionObserver();
    const patchDiscoverSnapshot = jest.fn();
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }, { public_key: 'older-duplicate' }],
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: null,
        my_deposit: null,
      },
      olderDepositsResponse: {
        older_deposits: [{ public_key: 'older-duplicate' }, { public_key: 'older-2' }],
        next_cursor: '2026-05-06T19:30:00.000000+00:00|122',
        has_more: true,
      },
    });

    renderDiscover({ patchDiscoverSnapshot });

    expect(await screen.findByText('older-1')).toBeInTheDocument();
    expect(screen.getByText('older-duplicate')).toBeInTheDocument();

    await waitFor(() => expect(intersectionObservers).toHaveLength(1));
    await act(async () => {
      intersectionObservers[0].trigger(true);
    });

    await waitFor(() => expect(screen.getByText('older-2')).toBeInTheDocument());
    expect(screen.getAllByText('older-duplicate')).toHaveLength(1);
    expect(global.fetch).toHaveBeenCalledWith(
      '/box-management/box-older-deposits/?boxSlug=box-a&limit=25&cursor=2026-05-06T20%3A00%3A00.000000%2B00%3A00%7C123',
      expect.any(Object)
    );
    expect(patchDiscoverSnapshot).toHaveBeenCalledWith('box-a', expect.objectContaining({
      olderDeposits: [{ public_key: 'older-1' }, { public_key: 'older-duplicate' }, { public_key: 'older-2' }],
      olderDepositsNextCursor: '2026-05-06T19:30:00.000000+00:00|122',
      olderDepositsHasMore: true,
    }));
    const patchedSnapshot = patchDiscoverSnapshot.mock.calls[0][1];
    expect(patchedSnapshot).not.toHaveProperty('main');
    expect(patchedSnapshot).not.toHaveProperty('myDeposit');
    expect(patchedSnapshot).not.toHaveProperty('activePinnedDeposit');
  });

  test('shows normal end message when older deposits have no more pages', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        older_deposits_next_cursor: null,
        older_deposits_has_more: false,
        active_pinned_deposit: null,
        my_deposit: null,
      },
    });

    renderDiscover();

    expect(await screen.findByText('Tu as vu toutes les chansons disponibles dans cette boîte.')).toBeInTheDocument();
  });

  test('falls back to Voir plus when IntersectionObserver is unavailable', async () => {
    const patchDiscoverSnapshot = jest.fn();
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: null,
        my_deposit: null,
      },
      olderDepositsResponse: {
        older_deposits: [{ public_key: 'older-2' }],
        next_cursor: null,
        has_more: false,
      },
    });

    renderDiscover({ patchDiscoverSnapshot });

    fireEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));

    expect(await screen.findByText('older-2')).toBeInTheDocument();
    expect(patchDiscoverSnapshot).toHaveBeenCalledWith('box-a', expect.objectContaining({
      olderDepositsHasMore: false,
    }));
  });

  test('stops at 100 older deposits and shows the session display limit message', async () => {
    mockIntersectionObserver();
    const initialOlderDeposits = Array.from({ length: 99 }, (_, index) => ({ public_key: `older-${index + 1}` }));
    const patchDiscoverSnapshot = jest.fn();
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: initialOlderDeposits,
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: null,
        my_deposit: null,
      },
      olderDepositsResponse: {
        older_deposits: [{ public_key: 'older-100' }, { public_key: 'older-101' }],
        next_cursor: '2026-05-06T19:00:00.000000+00:00|100',
        has_more: true,
      },
    });

    renderDiscover({ patchDiscoverSnapshot });

    expect(await screen.findByText('older-99')).toBeInTheDocument();
    await waitFor(() => expect(intersectionObservers).toHaveLength(1));
    await act(async () => {
      intersectionObservers[0].trigger(true);
    });

    expect(await screen.findByText('older-100')).toBeInTheDocument();
    expect(screen.queryByText('older-101')).not.toBeInTheDocument();
    expect(await screen.findByText('Tu as atteint la limite de chansons affichées pour cette session.')).toBeInTheDocument();
    const patch = patchDiscoverSnapshot.mock.calls[0][1];
    expect(patch.olderDeposits).toHaveLength(100);
    expect(patch.olderDepositsHasMore).toBe(false);
    expect(global.fetch.mock.calls.filter(([url]) => String(url).includes('/box-management/box-older-deposits/'))).toHaveLength(1);
  });

  test('redirects to closed when older deposits pagination requires a session', async () => {
    mockIntersectionObserver();
    const clearBoxSession = jest.fn();
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [{ public_key: 'older-1' }],
        older_deposits_next_cursor: '2026-05-06T20:00:00.000000+00:00|123',
        older_deposits_has_more: true,
        active_pinned_deposit: null,
        my_deposit: null,
      },
      olderDepositsStatus: 403,
      olderDepositsResponse: { code: 'BOX_SESSION_REQUIRED', detail: 'Session requise.' },
    });

    renderDiscover({ clearBoxSession });

    expect(await screen.findByText('older-1')).toBeInTheDocument();
    await waitFor(() => expect(intersectionObservers).toHaveLength(1));
    await act(async () => {
      intersectionObservers[0].trigger(true);
    });

    expect(await screen.findByText('Closed route')).toBeInTheDocument();
    expect(clearBoxSession).toHaveBeenCalledWith('box-a', { markExpired: true });
  });

  test('renders MyDeposit only through LiveSearchSection post-deposit state', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: { public_key: 'main-1' },
        older_deposits: [],
        active_pinned_deposit: null,
        my_deposit: {
          public_key: 'my-deposit-1',
          song: { title: 'Déjà déposée', artist: 'Artiste', image_url: 'cover.jpg' },
        },
        successes: [],
        points_balance: 500,
      },
      articles: [{ id: 1, title: 'Article vivant' }],
    });

    renderDiscover();

    const mainDeposit = await screen.findByTestId('deposit-main');
    const myDepositSection = screen.getByTestId('my-deposit');
    const article = await screen.findByTestId('article-card');

    expect(within(myDepositSection).getByText('Chanson déposée avec succès')).toBeInTheDocument();
    expect(within(myDepositSection).getByText('Déjà déposée')).toBeInTheDocument();
    expectNodeBefore(mainDeposit, myDepositSection);
    expectNodeBefore(myDepositSection, article);
    expect(screen.queryByRole('button', { name: 'Partager une chanson' })).not.toBeInTheDocument();
  });

  test('redirects to closed when box-content requires a session', async () => {
    mockFetch({
      boxContentStatus: 403,
      boxContent: { code: 'BOX_SESSION_REQUIRED', detail: 'Session requise.' },
    });
    const clearBoxSession = jest.fn();

    renderDiscover({ clearBoxSession });

    expect(await screen.findByText('Closed route')).toBeInTheDocument();
    expect(clearBoxSession).toHaveBeenCalledWith('box-a', { markExpired: true });
  });

  test('shows an empty state when box-content has no main deposit', async () => {
    mockFetch({
      boxContent: {
        boxSlug: 'box-a',
        main: null,
        older_deposits: [],
        active_pinned_deposit: null,
        my_deposit: null,
      },
    });

    renderDiscover();

    expect(await screen.findByText(/Aucune chanson à découvrir/i)).toBeInTheDocument();
  });

  test('shows an error state when box-content loading fails', async () => {
    mockFetch({
      boxContentStatus: 500,
      boxContent: { detail: 'Erreur serveur.' },
    });

    renderDiscover();

    expect(await screen.findByText('Erreur serveur.')).toBeInTheDocument();
  });
});
