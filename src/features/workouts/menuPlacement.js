const DEFAULT_GAP = 7;
const MIN_MENU_HEIGHT = 44;

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function calculateActionMenuLayout({
  triggerTop,
  triggerBottom,
  menuHeight,
  viewportTop = 0,
  viewportBottom,
  gap = DEFAULT_GAP,
}) {
  const safeViewportTop = finiteNumber(viewportTop, 0);
  const safeViewportBottom = Math.max(
    safeViewportTop,
    finiteNumber(viewportBottom, safeViewportTop),
  );
  const safeTriggerTop = finiteNumber(triggerTop, safeViewportTop);
  const safeTriggerBottom = Math.max(
    safeTriggerTop,
    finiteNumber(triggerBottom, safeTriggerTop),
  );
  const safeGap = Math.max(0, finiteNumber(gap, DEFAULT_GAP));
  const desiredHeight = Math.max(0, finiteNumber(menuHeight, 0));
  const spaceAbove = Math.max(0, safeTriggerTop - safeViewportTop - safeGap);
  const spaceBelow = Math.max(0, safeViewportBottom - safeTriggerBottom - safeGap);
  const placement = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove
    ? 'down'
    : 'up';
  const availableHeight = placement === 'up' ? spaceAbove : spaceBelow;

  return {
    placement,
    maxHeight: Math.max(MIN_MENU_HEIGHT, Math.floor(availableHeight)),
  };
}
