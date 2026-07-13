import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PwaInstallPrompt } from './PwaInstallPrompt.jsx';

describe('PwaInstallPrompt', () => {
  it('invokes the Chromium install prompt only after a user click', async () => {
    const browserPrompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt');
    Object.defineProperties(event, {
      prompt: { value: browserPrompt },
      userChoice: { value: Promise.resolve({ outcome: 'accepted', platform: 'web' }) },
    });

    render(<PwaInstallPrompt />);
    expect(screen.queryByRole('button', { name: 'Установить' })).not.toBeInTheDocument();

    act(() => window.dispatchEvent(event));
    const button = screen.getByRole('button', { name: 'Установить' });
    expect(browserPrompt).not.toHaveBeenCalled();

    fireEvent.click(button);
    await waitFor(() => expect(browserPrompt).toHaveBeenCalledTimes(1));
  });
});
