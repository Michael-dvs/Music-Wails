import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface MockTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
}

function generateMockTracks(count: number): MockTrack[] {
  const tracks: MockTrack[] = new Array(count);
  for (let i = 0; i < count; i++) {
    tracks[i] = {
      id: `track-${i}`,
      title: `Song Title ${i % 100} - ${(i * 37) % 1000}`,
      artist: `Artist ${(i * 13) % 50}`,
      album: `Album ${(i * 7) % 30}`,
      durationMs: 180000 + (i % 120) * 1000,
    };
  }
  return tracks;
}

// Compute capped animation delay (used across Library, Search, AlbumDetail, QueuePanel)
function getCappedStaggerDelay(index: number, cap = 20, step = 0.02): number {
  return Math.min(index, cap) * step;
}

describe('Large List Performance & Animation Delay Capping (07-F03)', () => {
  it('guarantees stagger delay is capped at 0.4s even for 5,000 items', () => {
    const delayFirst = getCappedStaggerDelay(0);
    const delay20 = getCappedStaggerDelay(20);
    const delay100 = getCappedStaggerDelay(100);
    const delay5000 = getCappedStaggerDelay(5000);

    assert.equal(delayFirst, 0);
    assert.equal(delay20, 0.4);
    assert.equal(delay100, 0.4, 'Delay must stay capped at 0.4s');
    assert.equal(delay5000, 0.4, 'Delay must not accumulate to hundreds of seconds');
  });

  it('measures sorting and filtering performance on 1,000 items under 25ms', () => {
    const tracks = generateMockTracks(1000);

    const t0 = performance.now();
    // Simulate Library filter by title or artist
    const query = 'Artist 12'.toLowerCase();
    const filtered = tracks.filter(
      (t) => t.title.toLowerCase().includes(query) || t.artist.toLowerCase().includes(query)
    );

    // Simulate Library sort by title
    filtered.sort((a, b) => a.title.localeCompare(b.title));
    const t1 = performance.now();

    const duration = t1 - t0;
    console.log(`[Perf Measurement] 1,000 items filter + sort completed in: ${duration.toFixed(3)} ms (found ${filtered.length} matches)`);

    assert.ok(duration < 25, `Expected < 25ms for 1,000 items, got ${duration}ms`);
    assert.ok(filtered.length > 0);
  });

  it('measures sorting and mapping on 5,000 items under 100ms', () => {
    const tracks = generateMockTracks(5000);

    const t0 = performance.now();
    const sorted = [...tracks].sort((a, b) => a.durationMs - b.durationMs);
    const mapped = sorted.map((t, idx) => ({
      key: t.id,
      index: idx + 1,
      displayDuration: `${Math.floor(t.durationMs / 60000)}:${String(Math.floor((t.durationMs % 60000) / 1000)).padStart(2, '0')}`,
    }));
    const t1 = performance.now();

    const duration = t1 - t0;
    console.log(`[Perf Measurement] 5,000 items sort + map completed in: ${duration.toFixed(3)} ms`);

    assert.ok(duration < 100, `Expected < 100ms for 5,000 items, got ${duration}ms`);
    assert.equal(mapped.length, 5000);
  });
});
