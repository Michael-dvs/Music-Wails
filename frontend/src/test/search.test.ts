import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface SearchState {
  songs: any[];
  artists: any[];
  albums: any[];
  loading: boolean;
  error: string | null;
}

// Controller modeling Search.tsx search execution with generation counter
class SearchController {
  private currentGen = 0;
  public state: SearchState = {
    songs: [],
    artists: [],
    albums: [],
    loading: false,
    error: null,
  };

  async search(
    query: string,
    mockFetch: (query: string) => Promise<{ songs: any[]; artists: any[]; albums: any[] }>
  ): Promise<boolean> {
    if (!query.trim()) {
      this.state = { songs: [], artists: [], albums: [], loading: false, error: null };
      return false;
    }

    const gen = ++this.currentGen;
    this.state.loading = true;
    this.state.error = null;

    try {
      const data = await mockFetch(query);
      if (gen !== this.currentGen) {
        // Discard stale response
        return false;
      }
      this.state.songs = data.songs;
      this.state.artists = data.artists;
      this.state.albums = data.albums;
      this.state.loading = false;
      return true;
    } catch (err: any) {
      if (gen !== this.currentGen) {
        return false;
      }
      this.state.error = err.message ?? 'Unknown error';
      this.state.loading = false;
      return false;
    }
  }

  // 06-F02: Condition for empty state
  get isEmpty(): boolean {
    return (
      !this.state.loading &&
      !this.state.error &&
      this.state.songs.length === 0 &&
      this.state.artists.length === 0 &&
      this.state.albums.length === 0
    );
  }
}

describe('Search Controller & Regression Guarantees (06-F01, 06-F02)', () => {
  it('prevents stale async responses from overwriting latest query results (06-F01)', async () => {
    const controller = new SearchController();

    // Query 1 takes 50ms, Query 2 takes 10ms
    const p1 = controller.search('taylor', () => new Promise(res => {
      setTimeout(() => res({
        songs: [{ id: '1', title: 'Love Story' }],
        artists: [],
        albums: [],
      }), 50);
    }));

    const p2 = controller.search('coldplay', () => new Promise(res => {
      setTimeout(() => res({
        songs: [{ id: '2', title: 'Yellow' }],
        artists: [],
        albums: [],
      }), 10);
    }));

    await Promise.all([p1, p2]);

    // Query 1 must NOT overwrite Query 2
    assert.equal(controller.state.songs.length, 1);
    assert.equal(controller.state.songs[0].title, 'Yellow');
  });

  it('correctly does NOT show empty state when albums are present but songs/artists are empty (06-F02)', () => {
    const controller = new SearchController();
    controller.state = {
      songs: [],
      artists: [],
      albums: [{ collectionId: 100, collectionName: 'Ghost Stories' }],
      loading: false,
      error: null,
    };

    assert.equal(controller.isEmpty, false, 'Should not be empty when albums exist');
  });

  it('shows empty state only when all 3 categories (songs, artists, albums) are empty', () => {
    const controller = new SearchController();
    controller.state = {
      songs: [],
      artists: [],
      albums: [],
      loading: false,
      error: null,
    };

    assert.equal(controller.isEmpty, true, 'Should be empty when all categories are empty');
  });

  it('handles search errors and distinguishes error state from empty state', async () => {
    const controller = new SearchController();

    await controller.search('bad-request', () => Promise.reject(new Error('Network error')));

    assert.equal(controller.state.loading, false);
    assert.equal(controller.state.error, 'Network error');
    assert.equal(controller.isEmpty, false, 'Error state must not be misidentified as empty');
  });
});
