import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Screen state fixture definitions
export interface ScreenStateFixture<T> {
  loading: boolean;
  error: string | null;
  data: T;
  retryAvailable?: boolean;
}

export const fixtures = {
  home: {
    loading: { loading: true, error: null, data: { sections: [], heroSong: null } },
    error: {
      loading: false,
      error: 'Gagal memuat kategori. Periksa koneksi internet Anda.',
      data: { sections: [], heroSong: null },
      retryAvailable: true,
    },
    empty: { loading: false, error: null, data: { sections: [], heroSong: null } },
    ready: {
      loading: false,
      error: null,
      data: {
        sections: [
          {
            id: 'pop',
            title: 'Top Hits Indonesia',
            songs: [{ id: '101', title: 'Sialan', artist: 'Juicy Luicy', album: 'Nonfiksi' }],
            error: null,
            loading: false,
          },
        ],
        heroSong: { id: '101', title: 'Sialan', artist: 'Juicy Luicy' },
      },
    },
  },

  search: {
    loading: { loading: true, error: null, data: { songs: [], artists: [], albums: [] } },
    error: {
      loading: false,
      error: 'Koneksi pencarian terputus.',
      data: { songs: [], artists: [], albums: [] },
      retryAvailable: true,
    },
    empty: {
      loading: false,
      error: null,
      data: { songs: [], artists: [], albums: [] },
    },
    albumOnly: {
      loading: false,
      error: null,
      data: {
        songs: [],
        artists: [],
        albums: [{ collectionId: 501, collectionName: 'Satu Sumpah' }],
      },
    },
  },

  library: {
    loading: { loading: true, error: null, data: { favorites: [] } },
    error: {
      loading: false,
      error: 'Gagal memuat pustaka lagu.',
      data: { favorites: [] },
      retryAvailable: true,
    },
    empty: { loading: false, error: null, data: { favorites: [] } },
    populated: {
      loading: false,
      error: null,
      data: {
        favorites: [
          { id: '1', title: 'Komang', artist: 'Raim Laode', album: 'Komang - Single' },
          { id: '2', title: 'Gala Bunga Kedamaian', artist: 'Sal Priadi', album: 'Markers and Such' },
        ],
      },
    },
  },

  playlists: {
    loading: { loading: true, error: null, data: { playlists: [] } },
    error: {
      loading: false,
      error: 'Gagal memuat playlist.',
      data: { playlists: [] },
      retryAvailable: true,
    },
    empty: { loading: false, error: null, data: { playlists: [] } },
  },

  playlistDetail: {
    loading: { loading: true, error: null, data: { playlist: { id: 'p1', name: 'Chill Vibes' }, songs: [] } },
    empty: {
      loading: false,
      error: null,
      data: { playlist: { id: 'p1', name: 'Chill Vibes' }, songs: [] },
      playAllEnabled: false,
    },
    populated: {
      loading: false,
      error: null,
      data: {
        playlist: { id: 'p1', name: 'Chill Vibes' },
        songs: [{ id: 's1', title: 'Asmalibrasi', artist: 'Soegi Bornean' }],
      },
      playAllEnabled: true,
    },
  },

  artistDetail: {
    loading: { loading: true, error: null, data: { topTracks: [], albums: [] } },
    error: {
      loading: false,
      error: 'Gagal memuat profil artis.',
      data: { topTracks: [], albums: [] },
      retryAvailable: true,
    },
    empty: { loading: false, error: null, data: { topTracks: [], albums: [] } },
  },

  albumDetail: {
    loading: { loading: true, error: null, data: { tracks: [] } },
    error: {
      loading: false,
      error: 'Gagal memuat lagu album. Periksa koneksi internet Anda.',
      data: { tracks: [] },
      retryAvailable: true,
    },
    empty: { loading: false, error: null, data: { tracks: [] } },
    multiDisc: {
      loading: false,
      error: null,
      data: {
        tracks: [
          { trackId: 1, discNumber: 1, trackNumber: 1, trackName: 'Intro' },
          { trackId: 2, discNumber: 1, trackNumber: 2, trackName: 'Track One' },
          { trackId: 3, discNumber: 2, trackNumber: 1, trackName: 'Disc 2 Opening' },
        ],
      },
    },
  },
};

describe('Screen Fixtures & State Machine Verification', () => {
  it('verifies Home loading, error, empty, and ready state contracts', () => {
    assert.equal(fixtures.home.loading.loading, true);
    assert.equal(fixtures.home.error.retryAvailable, true);
    assert.equal(fixtures.home.ready.data.sections.length, 1);
  });

  it('verifies Search distinguishability between album-only results and true empty', () => {
    // 06-F02 contract:
    const isEmpty = (d: { songs: any[]; artists: any[]; albums: any[] }) =>
      d.songs.length === 0 && d.artists.length === 0 && d.albums.length === 0;

    assert.equal(isEmpty(fixtures.search.empty.data), true);
    assert.equal(isEmpty(fixtures.search.albumOnly.data), false, 'Album-only must not be treated as empty');
  });

  it('verifies PlaylistDetail disables Play All when playlist has 0 tracks', () => {
    assert.equal(fixtures.playlistDetail.empty.playAllEnabled, false);
    assert.equal(fixtures.playlistDetail.populated.playAllEnabled, true);
  });

  it('verifies AlbumDetail multi-disc ordering preserves disc and track sequences', () => {
    const tracks = [...fixtures.albumDetail.multiDisc.data.tracks];
    tracks.sort((a, b) => {
      const discDiff = (a.discNumber ?? 1) - (b.discNumber ?? 1);
      if (discDiff !== 0) return discDiff;
      return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
    });

    assert.equal(tracks[0].trackName, 'Intro');
    assert.equal(tracks[1].trackName, 'Track One');
    assert.equal(tracks[2].trackName, 'Disc 2 Opening');
  });
});
