import { expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Home from './page';

// Mock fetch globally
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        status: 'ok',
        database: 'ok',
        redis: 'ok',
        timestamp: new Date().toISOString(),
      }),
  })
);

test('renders dashboard title', () => {
  render(<Home />);
  const title = screen.getByTestId('title');
  expect(title).toBeDefined();
  expect(title.textContent).toBe('Frontend-performance-learn-app Dashboard');
});

test('renders reload button', () => {
  render(<Home />);
  const button = screen.getByTestId('reload-btn');
  expect(button).toBeDefined();
  expect(button.textContent).toBe('Check Connection');
});
