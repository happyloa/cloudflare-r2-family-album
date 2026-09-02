import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RouteError from '../../app/error';

describe('RouteError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers recovery without exposing the original error message', () => {
    const retry = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <RouteError
        error={new Error('R2 secret must never appear in this UI')}
        retry={retry}
      />,
    );

    expect(screen.getByRole('alert').textContent).toContain('暫時無法顯示相簿');
    expect(screen.queryByText('R2 secret must never appear in this UI')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '再試一次' }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
