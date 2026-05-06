import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import MyDeposit from './MyDeposit';

const deposit = {
  accent_color: '#123456',
  song: {
    title: 'La chanson',
    artist: 'Une artiste',
    image_url: 'https://example.com/cover.jpg',
  },
};

describe('MyDeposit', () => {
  test('renders deposited song confirmation details', () => {
    render(<MyDeposit deposit={deposit} successes={[{ name: 'Total', points: 42 }]} pointsBalance={5060} />);

    expect(screen.getByText('Chanson déposée avec succès')).toBeInTheDocument();
    expect(screen.getByText('La chanson')).toBeInTheDocument();
    expect(screen.getByText('Une artiste')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'La chanson' })).toHaveAttribute('src', deposit.song.image_url);
    expect(screen.getByText('+42')).toBeInTheDocument();
  });

  test('does not render points when successes are empty after refresh', () => {
    render(<MyDeposit deposit={deposit} successes={[]} />);

    expect(screen.getByText('Chanson déposée avec succès')).toBeInTheDocument();
    expect(screen.queryByText('+0')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /points gagnés/i })).not.toBeInTheDocument();
  });

  test('does not render non-positive total points', () => {
    render(<MyDeposit deposit={deposit} successes={[{ name: 'Total', points: 0 }]} />);

    expect(screen.queryByText('+0')).not.toBeInTheDocument();
  });

  test('opens achievements when positive points are clicked', () => {
    const onOpenAchievements = jest.fn();
    render(
      <MyDeposit
        deposit={deposit}
        successes={[{ name: 'points_total', points: 12 }]}
        onOpenAchievements={onOpenAchievements}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /12 points gagnés/i }));

    expect(onOpenAchievements).toHaveBeenCalledTimes(1);
  });

  test('renders nothing without deposit', () => {
    const { container } = render(<MyDeposit deposit={null} />);

    expect(container).toBeEmptyDOMElement();
  });
});
