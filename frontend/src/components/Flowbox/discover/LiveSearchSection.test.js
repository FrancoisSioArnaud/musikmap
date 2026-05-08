import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { UserContext } from '../../UserContext';
import { FlowboxSessionContext } from '../runtime/FlowboxSessionContext';

import LiveSearchSection from './LiveSearchSection';

let mockLatestSearchPanelProps = null;

jest.mock('../../Common/Search/SearchPanel', () => ({
  __esModule: true,
  default: (props) => {
    mockLatestSearchPanelProps = props;
    return (
      <div>
        <div data-testid="deposit-flow-status">{props.depositFlowState?.status || 'missing'}</div>
        <div data-testid="deposit-visual-callback">
          {typeof props.onDepositVisualComplete === 'function' ? 'enabled' : 'disabled'}
        </div>
        <button
          type="button"
          onClick={() => props.onSelectSong({ id: 'track-1', name: 'Search song', artist: 'Artist', image_url: 'cover.jpg' }, 'request-1')}
        >
          Choisir Search song
        </button>
        <button
          type="button"
          onClick={() => props.onDepositVisualComplete?.('request-1')}
        >
          Terminer animation
        </button>
      </div>
    );
  },
}));

jest.mock('../../Security/TokensUtils', () => ({
  getCookie: jest.fn(() => 'csrf-token'),
}));

function LocationProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <span data-testid="location-search">{location.search}</span>
      <button type="button" onClick={() => navigate(-1)}>Retour navigateur</button>
    </div>
  );
}

function renderLiveSearchSection(props = {}, options = {}) {
  const setUser = jest.fn();
  const clearBoxSession = jest.fn();
  const onDepositCreated = jest.fn();
  const userContextValue = { user: { id: 1, points: 120 }, setUser, ...(options.userContext || {}) };
  const flowboxContextValue = { clearBoxSession, ...(options.flowboxContext || {}) };
  const initialEntries = options.initialEntries || ['/flowbox/box-a/discover'];
  const initialIndex = options.initialIndex ?? initialEntries.length - 1;

  const rendered = render(
    <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
      <UserContext.Provider value={userContextValue}>
        <FlowboxSessionContext.Provider value={flowboxContextValue}>
          <LocationProbe />
          <Routes>
            <Route
              path="/flowbox/:boxSlug/discover"
              element={(
                <LiveSearchSection
                  boxSlug="box-a"
                  myDeposit={null}
                  successes={[]}
                  pointsBalance={null}
                  onDepositCreated={onDepositCreated}
                  {...props}
                />
              )}
            />
            <Route path="/flowbox/:boxSlug/closed" element={<div>Closed route</div>} />
          </Routes>
        </FlowboxSessionContext.Provider>
      </UserContext.Provider>
    </MemoryRouter>
  );

  return { ...rendered, setUser, clearBoxSession, onDepositCreated };
}

function mockJsonResponse(body, init = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  };
}

function mockMatchMedia(matches) {
  window.matchMedia = jest.fn().mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

function setViewportHeight(height) {
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
}

function mockLiveSearchSlotRect(bottom) {
  const liveSearch = document.querySelector('.liveSearch');
  const slot = document.querySelector('.liveSearch_slot');

  Object.defineProperty(liveSearch, 'offsetHeight', { configurable: true, value: 184 });
  slot.getBoundingClientRect = jest.fn(() => ({
    bottom,
    height: 184,
    left: 0,
    right: 0,
    top: bottom - 184,
    width: 320,
    x: 0,
    y: bottom - 184,
    toJSON: () => ({}),
  }));

  return liveSearch;
}

describe('LiveSearchSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLatestSearchPanelProps = null;
    global.fetch = jest.fn();
    window.requestAnimationFrame = jest.fn((callback) => {
      callback();
      return 1;
    });
    Element.prototype.scrollIntoView = jest.fn();
    mockMatchMedia(false);
    setViewportHeight(700);
  });

  test('shows a share CTA before deposit and opens the SearchPanel drawer through the URL', async () => {
    renderLiveSearchSection();

    expect(screen.getByRole('button', { name: 'Partager une chanson' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Ajoute une chanson à la boîte/i, level: 3 })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));

    expect(await screen.findByText('Choisis une chanson à partager')).toBeInTheDocument();
    expect(screen.getByTestId('location-search')).toHaveTextContent('drawer=live-search');
  });

  test('adds the fixed class on mobile before deposit when the LiveSearch slot bottom exceeds the viewport', async () => {
    mockMatchMedia(true);
    setViewportHeight(600);
    renderLiveSearchSection();
    const liveSearch = mockLiveSearchSlotRect(760);

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(liveSearch).toHaveClass('fixed');
    });
  });

  test('removes the fixed class on mobile before deposit when the LiveSearch slot is fully visible', async () => {
    mockMatchMedia(true);
    setViewportHeight(600);
    renderLiveSearchSection();
    const liveSearch = mockLiveSearchSlotRect(760);

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(liveSearch).toHaveClass('fixed');
    });

    mockLiveSearchSlotRect(600);
    fireEvent.resize(window);

    await waitFor(() => {
      expect(liveSearch).not.toHaveClass('fixed');
    });
  });

  test('does not add the fixed class on desktop before deposit even when the slot bottom exceeds the viewport', async () => {
    mockMatchMedia(false);
    setViewportHeight(600);
    renderLiveSearchSection();
    const liveSearch = mockLiveSearchSlotRect(760);

    fireEvent.scroll(window);

    await waitFor(() => {
      expect(liveSearch).not.toHaveClass('fixed');
    });
  });

  test('browser back closes the URL-driven drawer', async () => {
    renderLiveSearchSection({});

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    expect(await screen.findByText('Choisis une chanson à partager')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Retour navigateur'));

    await waitFor(() => {
      expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('location-search')).toBeEmptyDOMElement();
  });

  test('posts selected song, waits for the visual completion, updates user points, closes drawer and scrolls to the section', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse({
      my_deposit: { public_key: 'dep-1', song: { title: 'Search song', artist: 'Artist' } },
      successes: [{ name: 'total', points: 42 }],
      points_balance: 5060,
      deposit_points_earned: 42,
      already_exists: false,
    }));

    const { onDepositCreated, setUser } = renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    expect(await screen.findByTestId('deposit-visual-callback')).toHaveTextContent('enabled');

    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/box-management/box-deposit/?boxSlug=box-a',
        expect.objectContaining({
          method: 'POST',
          credentials: 'same-origin',
          body: JSON.stringify({ option: { id: 'track-1', name: 'Search song', artist: 'Artist', image_url: 'cover.jpg' } }),
        })
      );
    });
    const [depositUrl, depositInit] = global.fetch.mock.calls[0];
    expect(String(depositUrl)).not.toContain(['get', 'box'].join('-'));
    expect(JSON.parse(depositInit.body)).toEqual({
      option: { id: 'track-1', name: 'Search song', artist: 'Artist', image_url: 'cover.jpg' },
    });

    await waitFor(() => {
      expect(screen.getByTestId('deposit-flow-status')).toHaveTextContent('success');
    });
    expect(mockLatestSearchPanelProps.onDepositVisualComplete).toEqual(expect.any(Function));
    expect(onDepositCreated).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByText('Choisis une chanson à partager')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Terminer animation' }));

    await waitFor(() => {
      expect(onDepositCreated).toHaveBeenCalledWith({
        myDeposit: { public_key: 'dep-1', song: { title: 'Search song', artist: 'Artist' } },
        successes: [{ name: 'total', points: 42 }],
        pointsBalance: 5060,
        depositPointsEarned: 42,
      });
    });

    expect(setUser).toHaveBeenCalledWith(expect.any(Function));
    expect(setUser.mock.calls[0][0]({ id: 1, points: 120 })).toEqual({ id: 1, points: 5060 });
    await waitFor(() => {
      expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });

  test('renders MyDeposit after deposit and does not allow opening search', () => {
    renderLiveSearchSection({
      myDeposit: { song: { title: 'Déjà déposée', artist: 'Artiste', image_url: 'cover.jpg' } },
      successes: [],
    });

    expect(screen.getByText('Chanson déposée avec succès')).toBeInTheDocument();
    expect(screen.getByText('Déjà déposée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Partager une chanson' })).not.toBeInTheDocument();
    expect(document.querySelector('.liveSearch.fixed')).not.toBeInTheDocument();
  });

  test('redirects to closed when the box session is required', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(
      { code: 'BOX_SESSION_REQUIRED', detail: 'Session requise.' },
      { ok: false, status: 403 }
    ));

    const { clearBoxSession } = renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    expect(await screen.findByText('Closed route')).toBeInTheDocument();
    expect(clearBoxSession).toHaveBeenCalledWith('box-a', { markExpired: true });
  });

  test('shows a clear message when a deposit already exists', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(
      { code: 'BOX_SESSION_DEPOSIT_ALREADY_EXISTS' },
      { ok: false, status: 409 }
    ));

    renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    expect(await screen.findAllByText('Tu as déjà partagé une chanson dans cette session.')).toHaveLength(2);
  });

  test('resynchronizes UI from a deposit already exists conflict payload after visual completion', async () => {
    global.fetch.mockResolvedValueOnce(mockJsonResponse(
      {
        status: 409,
        code: 'BOX_SESSION_DEPOSIT_ALREADY_EXISTS',
        detail: 'Tu as déjà partagé une chanson dans cette session.',
        my_deposit: { public_key: 'dep-existing', song: { title: 'Existing song', artist: 'Artist' } },
        successes: [{ name: 'Total', points: 31 }],
        points_balance: 151,
        deposit_points_earned: 31,
      },
      { ok: false, status: 409 }
    ));

    const { onDepositCreated, setUser } = renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    await waitFor(() => {
      expect(screen.getByTestId('deposit-flow-status')).toHaveTextContent('success');
    });
    expect(onDepositCreated).not.toHaveBeenCalled();
    expect(setUser).not.toHaveBeenCalled();
    expect(screen.getByText('Choisis une chanson à partager')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Terminer animation' }));

    await waitFor(() => {
      expect(onDepositCreated).toHaveBeenCalledWith({
        myDeposit: { public_key: 'dep-existing', song: { title: 'Existing song', artist: 'Artist' } },
        successes: [{ name: 'Total', points: 31 }],
        pointsBalance: 151,
        depositPointsEarned: 31,
      });
    });
    expect(setUser.mock.calls[0][0]({ id: 1, points: 120 })).toEqual({ id: 1, points: 151 });
    await waitFor(() => {
      expect(screen.queryByText('Choisis une chanson à partager')).not.toBeInTheDocument();
    });
  });

  test('shows a MUI error surface for network errors', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Réseau indisponible.'));

    renderLiveSearchSection();

    fireEvent.click(screen.getByRole('button', { name: 'Partager une chanson' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choisir Search song' }));

    expect(await screen.findAllByText('Réseau indisponible.')).toHaveLength(2);
  });
});
