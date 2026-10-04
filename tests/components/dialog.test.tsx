import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from '@/components/media/hooks/useFocusTrap';

function Dialog({ open, name, onEscape }: { open: boolean; name: string; onEscape: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(open, { onEscape });
  return open ? <div ref={ref} role="dialog" aria-label={name}><button>{name}</button></div> : null;
}

describe('shared dialog keyboard and scroll behavior', () => {
  it('keeps nested dialogs isolated and restores focus when each one closes', async () => {
    const firstClose = vi.fn(), secondClose = vi.fn();
    const contents = (first: boolean, second: boolean) => <>
      <button>開啟</button>
      <Dialog open={first} name="第一層" onEscape={firstClose} />
      <Dialog open={second} name="第二層" onEscape={secondClose} />
    </>;
    const view = render(contents(false, false));
    const opener = screen.getByRole('button', { name: '開啟' }); opener.focus();
    view.rerender(contents(true, false));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '第一層' })));
    view.rerender(contents(true, true));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: '第二層' })));
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '第二層' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled(); expect(secondClose).toHaveBeenCalledTimes(1);
    view.rerender(contents(true, false));
    expect(document.body.classList.contains('modal-open')).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '第一層' }));
    view.rerender(contents(false, false));
    expect(document.body.classList.contains('modal-open')).toBe(false);
    expect(document.activeElement).toBe(opener);
    view.unmount();
  });
});
