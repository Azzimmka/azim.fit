import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyUpdate = vi.fn();
const dismissUpdate = vi.fn();

vi.mock('./usePwaUpdate.js', () => ({
  usePwaUpdate: () => ({
    applyUpdate,
    dismissOfflineReady: vi.fn(),
    dismissUpdate,
    needRefresh: true,
    offlineReady: false,
  }),
}));

import { PwaUpdatePrompt } from './PwaUpdatePrompt.jsx';

describe('PwaUpdatePrompt', () => {
  beforeEach(() => vi.clearAllMocks());

  it('waits for explicit confirmation before applying an update', () => {
    render(<PwaUpdatePrompt />);
    expect(applyUpdate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    expect(applyUpdate).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Позже' }));
    expect(dismissUpdate).toHaveBeenCalledTimes(1);
  });
});
