import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundaryInner, type ErrorBoundaryProps } from 'vinext/shims/error-boundary';

import RouteError from '../../app/error';
import GlobalError from '../../app/global-error';

const secret = 'R2 secret must never appear in this UI';

describe.each([
  { name: 'RouteError', Fallback: RouteError, title: '暫時無法顯示相簿' },
  { name: 'GlobalError', Fallback: GlobalError, title: '相簿暫時無法開啟' },
])('$name', ({ Fallback, title }) => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Rendered by the installed Vinext boundary, so a prop the framework does not pass fails here.
  it('recovers through the framework boundary without exposing the original error message', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let failing = true;
    const Album = () => {
      if (failing) throw new Error(secret);
      return <p>相簿已恢復</p>;
    };

    render(
      <ErrorBoundaryInner pathname="/" fallback={Fallback as ErrorBoundaryProps['fallback']}>
        <Album />
      </ErrorBoundaryInner>,
    );

    expect(screen.getByRole('alert').textContent).toContain(title);
    expect(screen.queryByText(secret, { exact: false })).toBeNull();

    failing = false;
    fireEvent.click(screen.getByRole('button', { name: '再試一次' }));
    expect(screen.getByText('相簿已恢復')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
