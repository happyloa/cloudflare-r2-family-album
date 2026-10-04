import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ContextMenu } from '@/components/media/ContextMenu';

afterEach(cleanup);
it('keeps a newly opened menu for an already queued document scroll event', () => {
  const onClose = vi.fn();
  render(<ContextMenu open x={100} y={100} items={[{ label: '移動', onSelect: vi.fn() }]} onClose={onClose} />);
  fireEvent.scroll(document);
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole('menu')).toBeTruthy();
  fireEvent.resize(window);
  expect(onClose).toHaveBeenCalledOnce();
});
