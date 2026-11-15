import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface QueueItem {
  id: string;
  title: string;
  artist: string;
}

// Queue management operations modeled directly after App.tsx & QueuePanel.tsx
class QueueManager {
  public queue: QueueItem[];
  public currentTrack: QueueItem | null;

  constructor(initialQueue: QueueItem[] = [], initialTrack: QueueItem | null = null) {
    this.queue = [...initialQueue];
    this.currentTrack = initialTrack;
  }

  move(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.queue.length) return;
    if (toIndex < 0 || toIndex >= this.queue.length) return;
    if (fromIndex === toIndex) return;

    const updated = [...this.queue];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    this.queue = updated;
  }

  remove(index: number): void {
    if (index < 0 || index >= this.queue.length) return;
    this.queue = this.queue.filter((_, i) => i !== index);
  }

  clear(): void {
    this.queue = [];
  }

  playNext(song: QueueItem): void {
    if (!this.currentTrack) {
      this.queue = [song];
      return;
    }
    const curIdx = this.queue.findIndex(s => s.id === this.currentTrack?.id);
    const insertIdx = curIdx >= 0 ? curIdx + 1 : 0;
    const nextQueue = [...this.queue];
    nextQueue.splice(insertIdx, 0, song);
    this.queue = nextQueue;
  }

  addToQueue(song: QueueItem): void {
    this.queue = [...this.queue, song];
  }

  reorder(newQueue: QueueItem[]): void {
    this.queue = newQueue;
  }

  advanceNext(): void {
    if (!this.currentTrack || !this.queue.length) return;
    const curIdx = this.queue.findIndex(s => s.id === this.currentTrack?.id);
    const nextIdx = curIdx >= 0 ? curIdx + 1 : 1;
    if (nextIdx < this.queue.length) {
      const remaining = this.queue.slice(nextIdx);
      this.currentTrack = remaining[0];
      this.queue = remaining;
    }
  }

  playTrackAt(index: number): void {
    if (index < 0 || index >= this.queue.length) return;
    const remaining = this.queue.slice(index);
    this.currentTrack = remaining[0];
    this.queue = remaining;
  }

  refreshAutoQueue(recommendations: QueueItem[]): void {
    if (!this.currentTrack) return;
    this.queue = [this.currentTrack, ...recommendations];
  }
}

// Preload validation logic modeled directly after App.tsx periodic 2s check
function checkPreloadStaleness(
  currentTime: number,
  duration: number,
  currentSong: QueueItem | null,
  queue: QueueItem[],
  preloadedSong: QueueItem | null,
  seamlessPreloadEnabled: boolean = true,
  isRepeat: boolean = false
): boolean {
  if (!currentSong || !seamlessPreloadEnabled || isRepeat) return false;
  if (!Number.isFinite(duration) || duration <= 0) return false;

  // Check 75% progress trigger
  if (currentTime >= duration * 0.75) {
    const index = queue.findIndex(t => t.id === currentSong.id);
    const next = index >= 0 ? queue[index + 1] : undefined;

    if (preloadedSong && next && preloadedSong.id !== next.id) {
      return true; // stale! Invalidation required
    }
  }

  return false;
}

describe('Queue Manager & Reorder Operations (05-F04, 07-F05)', () => {
  it('reorders tracks upward within bounds', () => {
    const qm = new QueueManager([
      { id: '1', title: 'Song A', artist: 'Artist 1' },
      { id: '2', title: 'Song B', artist: 'Artist 2' },
      { id: '3', title: 'Song C', artist: 'Artist 3' },
    ]);

    qm.move(1, 0); // Move Song B above Song A
    assert.deepEqual(qm.queue.map(s => s.title), ['Song B', 'Song A', 'Song C']);
  });

  it('reorders tracks downward within bounds', () => {
    const qm = new QueueManager([
      { id: '1', title: 'Song A', artist: 'Artist 1' },
      { id: '2', title: 'Song B', artist: 'Artist 2' },
      { id: '3', title: 'Song C', artist: 'Artist 3' },
    ]);

    qm.move(0, 2); // Move Song A to end
    assert.deepEqual(qm.queue.map(s => s.title), ['Song B', 'Song C', 'Song A']);
  });

  it('ignores out-of-bounds reorder requests', () => {
    const qm = new QueueManager([
      { id: '1', title: 'Song A', artist: 'Artist 1' },
      { id: '2', title: 'Song B', artist: 'Artist 2' },
    ]);

    qm.move(0, -1); // Illegal negative index
    assert.deepEqual(qm.queue.map(s => s.title), ['Song A', 'Song B']);

    qm.move(1, 5); // Illegal out-of-range index
    assert.deepEqual(qm.queue.map(s => s.title), ['Song A', 'Song B']);
  });

  it('removes a specific track from queue', () => {
    const qm = new QueueManager([
      { id: '1', title: 'Song A', artist: 'Artist 1' },
      { id: '2', title: 'Song B', artist: 'Artist 2' },
      { id: '3', title: 'Song C', artist: 'Artist 3' },
    ]);

    qm.remove(1); // Remove Song B
    assert.deepEqual(qm.queue.map(s => s.title), ['Song A', 'Song C']);
  });

  it('clears all queued tracks', () => {
    const qm = new QueueManager([
      { id: '1', title: 'Song A', artist: 'Artist 1' },
      { id: '2', title: 'Song B', artist: 'Artist 2' },
    ]);

    qm.clear();
    assert.equal(qm.queue.length, 0);
  });

  it('inserts track immediately after currently playing song via playNext', () => {
    const song1 = { id: '1', title: 'Song A', artist: 'Artist 1' };
    const song2 = { id: '2', title: 'Song B', artist: 'Artist 2' };
    const song3 = { id: '3', title: 'Song C', artist: 'Artist 3' };
    const newTrack = { id: '99', title: 'Urgent Track', artist: 'Guest' };

    const qm = new QueueManager([song1, song2, song3], song1);
    qm.playNext(newTrack);

    assert.deepEqual(qm.queue.map(s => s.id), ['1', '99', '2', '3']);
    assert.equal(qm.queue[1].title, 'Urgent Track');
  });

  it('appends track to the end of queue via addToQueue', () => {
    const song1 = { id: '1', title: 'Song A', artist: 'Artist 1' };
    const song2 = { id: '2', title: 'Song B', artist: 'Artist 2' };
    const newTrack = { id: '99', title: 'Queued Later', artist: 'Guest' };

    const qm = new QueueManager([song1, song2], song1);
    qm.addToQueue(newTrack);

    assert.deepEqual(qm.queue.map(s => s.id), ['1', '2', '99']);
    assert.equal(qm.queue[2].title, 'Queued Later');
  });

  it('reorders entire queue smoothly (from drag-and-drop interaction)', () => {
    const song1 = { id: '1', title: 'Song A', artist: 'Artist 1' };
    const song2 = { id: '2', title: 'Song B', artist: 'Artist 2' };
    const song3 = { id: '3', title: 'Song C', artist: 'Artist 3' };

    const qm = new QueueManager([song1, song2, song3], song1);
    qm.reorder([song3, song1, song2]);

    assert.deepEqual(qm.queue.map(s => s.id), ['3', '1', '2']);
  });

  it('detects stale preload when queue is reordered or modified at >= 75% progress', () => {
    const song1 = { id: '1', title: 'Current Song', artist: 'Artist 1' };
    const song2 = { id: '2', title: 'Old Next', artist: 'Artist 2' };
    const song3 = { id: '3', title: 'New Next', artist: 'Artist 3' };

    const duration = 100;
    const progress78Percent = 78; // >= 75%

    // Case 1: Before 75%, should NOT invalidate even if next track changed
    const before75 = checkPreloadStaleness(70, duration, song1, [song1, song3, song2], song2);
    assert.equal(before75, false);

    // Case 2: At 78% progress, preloaded is '2', but user dragged '3' to next position
    const staleDetected = checkPreloadStaleness(progress78Percent, duration, song1, [song1, song3, song2], song2);
    assert.equal(staleDetected, true, 'Must flag preload as stale when next song in queue changed');

    // Case 3: At 78% progress, preloaded is '2' and queue still has '2' next
    const validPreload = checkPreloadStaleness(progress78Percent, duration, song1, [song1, song2, song3], song2);
    assert.equal(validPreload, false, 'Should keep valid preload when next song remains unchanged');
  });

  it('removes played track on advanceNext so playing track is always at index 0 (top of queue)', () => {
    const song1 = { id: '1', title: 'Song 1', artist: 'Artist 1' };
    const song2 = { id: '2', title: 'Song 2', artist: 'Artist 2' };
    const song3 = { id: '3', title: 'Song 3', artist: 'Artist 3' };

    const qm = new QueueManager([song1, song2, song3], song1);
    assert.equal(qm.currentTrack?.id, '1');
    assert.equal(qm.queue[0].id, '1');

    // Song 1 finishes or user clicks next
    qm.advanceNext();

    // Song 1 must be removed, Song 2 is now at index 0
    assert.equal(qm.currentTrack?.id, '2');
    assert.deepEqual(qm.queue.map(s => s.id), ['2', '3']);
    assert.equal(qm.queue[0].id, '2', 'Playing track must always be at index 0 (top of queue)');
  });

  it('removes preceding tracks when a track is clicked in queue so clicked track is at index 0', () => {
    const song1 = { id: '1', title: 'Song 1', artist: 'Artist 1' };
    const song2 = { id: '2', title: 'Song 2', artist: 'Artist 2' };
    const song3 = { id: '3', title: 'Song 3', artist: 'Artist 3' };
    const song4 = { id: '4', title: 'Song 4', artist: 'Artist 4' };

    const qm = new QueueManager([song1, song2, song3, song4], song1);

    // User clicks Song 3 (index 2) directly in QueuePanel
    qm.playTrackAt(2);

    assert.equal(qm.currentTrack?.id, '3');
    assert.deepEqual(qm.queue.map(s => s.id), ['3', '4']);
    assert.equal(qm.queue[0].id, '3', 'Selected track must become the top item in queue');
  });

  it('refreshes auto queue recommendations while keeping current track playing at index 0', () => {
    const song1 = { id: '1', title: 'Song 1', artist: 'Artist 1' };
    const oldRec1 = { id: '10', title: 'Old Rec 1', artist: 'Artist' };
    const oldRec2 = { id: '11', title: 'Old Rec 2', artist: 'Artist' };
    const newRec1 = { id: '20', title: 'Fresh Rec 1', artist: 'Artist' };
    const newRec2 = { id: '21', title: 'Fresh Rec 2', artist: 'Artist' };

    const qm = new QueueManager([song1, oldRec1, oldRec2], song1);

    // Click refresh queue button
    qm.refreshAutoQueue([newRec1, newRec2]);

    assert.equal(qm.currentTrack?.id, '1');
    assert.deepEqual(qm.queue.map(s => s.id), ['1', '20', '21']);
    assert.equal(qm.queue[0].id, '1', 'Current song must remain uninterrupted at the top');
  });
});
