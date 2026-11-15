import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Model the global keyboard handler in App.tsx
function handleKeyDown(
  e: {
    code: string;
    targetTagName: string;
    isContentEditable: boolean;
    preventDefault: () => void;
  },
  state: {
    showLyrics: boolean;
    showQueue: boolean;
    isPlaying: boolean;
  },
  actions: {
    togglePlay: () => void;
    closeLyrics: () => void;
    closeQueue: () => void;
  }
) {
  const tagName = e.targetTagName.toUpperCase();
  const isInputActive =
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    tagName === 'BUTTON' ||
    e.isContentEditable;

  // Space for play/pause (only when not interacting with form/button controls)
  if (e.code === 'Space' && !isInputActive) {
    e.preventDefault();
    actions.togglePlay();
    return;
  }

  // Escape: prioritize closing top-most overlay
  if (e.code === 'Escape') {
    if (state.showLyrics) {
      actions.closeLyrics();
      return;
    }
    if (state.showQueue) {
      actions.closeQueue();
      return;
    }
  }
}

// Model sidebar keyboard resize handler
function handleSidebarSeparatorKey(
  key: string,
  currentWidth: number,
  step = 16
): number {
  if (key === 'ArrowLeft') {
    return Math.max(160, currentWidth - step);
  }
  if (key === 'ArrowRight') {
    return Math.min(400, currentWidth + step);
  }
  return currentWidth;
}

describe('Keyboard Shortcuts & Global Event Handling (07-F06)', () => {
  it('does NOT trigger global play/pause when Space is pressed on a button', () => {
    let playToggled = false;
    let prevented = false;

    handleKeyDown(
      {
        code: 'Space',
        targetTagName: 'BUTTON',
        isContentEditable: false,
        preventDefault: () => { prevented = true; },
      },
      { showLyrics: false, showQueue: false, isPlaying: false },
      {
        togglePlay: () => { playToggled = true; },
        closeLyrics: () => {},
        closeQueue: () => {},
      }
    );

    assert.equal(playToggled, false, 'Button must retain native Space activation');
    assert.equal(prevented, false);
  });

  it('does NOT trigger global play/pause when Space is pressed in an input field', () => {
    let playToggled = false;
    let prevented = false;

    handleKeyDown(
      {
        code: 'Space',
        targetTagName: 'INPUT',
        isContentEditable: false,
        preventDefault: () => { prevented = true; },
      },
      { showLyrics: false, showQueue: false, isPlaying: false },
      {
        togglePlay: () => { playToggled = true; },
        closeLyrics: () => {},
        closeQueue: () => {},
      }
    );

    assert.equal(playToggled, false);
    assert.equal(prevented, false);
  });

  it('triggers global play/pause when Space is pressed on neutral background/container', () => {
    let playToggled = false;
    let prevented = false;

    handleKeyDown(
      {
        code: 'Space',
        targetTagName: 'DIV',
        isContentEditable: false,
        preventDefault: () => { prevented = true; },
      },
      { showLyrics: false, showQueue: false, isPlaying: false },
      {
        togglePlay: () => { playToggled = true; },
        closeLyrics: () => {},
        closeQueue: () => {},
      }
    );

    assert.equal(playToggled, true);
    assert.equal(prevented, true);
  });

  it('prioritizes closing lyrics when Escape is pressed and both lyrics and queue are active', () => {
    let closedLyrics = false;
    let closedQueue = false;

    handleKeyDown(
      {
        code: 'Escape',
        targetTagName: 'BODY',
        isContentEditable: false,
        preventDefault: () => {},
      },
      { showLyrics: true, showQueue: true, isPlaying: true },
      {
        togglePlay: () => {},
        closeLyrics: () => { closedLyrics = true; },
        closeQueue: () => { closedQueue = true; },
      }
    );

    assert.equal(closedLyrics, true, 'Lyrics overlay must close first');
    assert.equal(closedQueue, false, 'Queue panel must remain open underneath');
  });

  it('closes queue panel when Escape is pressed and lyrics is closed', () => {
    let closedLyrics = false;
    let closedQueue = false;

    handleKeyDown(
      {
        code: 'Escape',
        targetTagName: 'BODY',
        isContentEditable: false,
        preventDefault: () => {},
      },
      { showLyrics: false, showQueue: true, isPlaying: true },
      {
        togglePlay: () => {},
        closeLyrics: () => { closedLyrics = true; },
        closeQueue: () => { closedQueue = true; },
      }
    );

    assert.equal(closedLyrics, false);
    assert.equal(closedQueue, true);
  });

  it('handles keyboard sidebar resizing with ArrowLeft and ArrowRight bounded [160, 400]', () => {
    let width = 240;

    // ArrowLeft shrinks
    width = handleSidebarSeparatorKey('ArrowLeft', width, 20);
    assert.equal(width, 220);

    // Clamp at minimum 160
    width = handleSidebarSeparatorKey('ArrowLeft', 170, 20);
    assert.equal(width, 160);
    width = handleSidebarSeparatorKey('ArrowLeft', 160, 20);
    assert.equal(width, 160);

    // ArrowRight expands
    width = handleSidebarSeparatorKey('ArrowRight', 160, 50);
    assert.equal(width, 210);

    // Clamp at maximum 400
    width = handleSidebarSeparatorKey('ArrowRight', 390, 20);
    assert.equal(width, 400);
    width = handleSidebarSeparatorKey('ArrowRight', 400, 20);
    assert.equal(width, 400);
  });
});
