import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

interface MockPlaylist {
  id: string;
  name: string;
  track_count?: number;
}

// Logic model for Sidebar playlist quick list interactions
class SidebarNavigationManager {
  public activeTab: string = 'home';
  public selectedPlaylistId: string | null = null;
  public userPlaylists: MockPlaylist[] = [];

  constructor(initialTab = 'home', initialPlaylists: MockPlaylist[] = []) {
    this.activeTab = initialTab;
    this.userPlaylists = initialPlaylists;
  }

  // User clicks main menu button (Home, Search, Library, Playlists)
  setActiveTab(tab: string): void {
    this.activeTab = tab;
    this.selectedPlaylistId = null; // resets specific playlist selection to view overview
  }

  // User clicks a quick-list playlist in the sidebar
  selectPlaylist(playlistId: string): void {
    this.activeTab = 'playlists';
    this.selectedPlaylistId = playlistId;
  }

  // Returns whether quick list section should be rendered in sidebar
  shouldShowQuickList(isLoggedIn: boolean): boolean {
    return isLoggedIn && this.userPlaylists.length > 0;
  }

  // Returns whether main Playlists menu item is in overview active state
  isMainPlaylistsOverviewActive(): boolean {
    return this.activeTab === 'playlists' && this.selectedPlaylistId === null;
  }

  // Returns whether a specific playlist item is active
  isPlaylistSelected(playlistId: string): boolean {
    return this.activeTab === 'playlists' && this.selectedPlaylistId === playlistId;
  }
}

describe('Sidebar Playlist Quick List & Navigation Architecture', () => {
  it('does NOT show quick list when user has 0 playlists or is logged out', () => {
    const nav = new SidebarNavigationManager('home', []);
    assert.equal(nav.shouldShowQuickList(false), false, 'Logged out user must not see quick list');
    assert.equal(nav.shouldShowQuickList(true), false, 'Logged in user with 0 playlists must not see quick list');
  });

  it('shows quick list when user is logged in and has at least 1 playlist', () => {
    const playlists: MockPlaylist[] = [
      { id: 'pl-1', name: 'Chill Vibes', track_count: 5 },
      { id: 'pl-2', name: 'Work Focus', track_count: 12 },
    ];
    const nav = new SidebarNavigationManager('home', playlists);
    assert.equal(nav.shouldShowQuickList(true), true);
  });

  it('navigates directly to specific playlist when clicked in quick list', () => {
    const playlists: MockPlaylist[] = [
      { id: 'pl-1', name: 'Chill Vibes', track_count: 5 },
      { id: 'pl-2', name: 'Work Focus', track_count: 12 },
    ];
    const nav = new SidebarNavigationManager('home', playlists);

    nav.selectPlaylist('pl-2');
    assert.equal(nav.activeTab, 'playlists');
    assert.equal(nav.selectedPlaylistId, 'pl-2');
    assert.equal(nav.isPlaylistSelected('pl-2'), true);
    assert.equal(nav.isPlaylistSelected('pl-1'), false);
    // Main Playlists button is NOT considered overview active because a specific playlist is open
    assert.equal(nav.isMainPlaylistsOverviewActive(), false);
  });

  it('returns to Playlists overview when main Playlists menu button is clicked', () => {
    const playlists: MockPlaylist[] = [
      { id: 'pl-1', name: 'Chill Vibes', track_count: 5 },
    ];
    const nav = new SidebarNavigationManager('playlists', playlists);
    nav.selectPlaylist('pl-1');
    assert.equal(nav.selectedPlaylistId, 'pl-1');

    // Click main Playlists menu button
    nav.setActiveTab('playlists');
    assert.equal(nav.activeTab, 'playlists');
    assert.equal(nav.selectedPlaylistId, null, 'Selection must clear so user sees overview & create button');
    assert.equal(nav.isMainPlaylistsOverviewActive(), true);
  });

  it('switches tabs and resets playlist selection when clicking other main tabs', () => {
    const playlists: MockPlaylist[] = [
      { id: 'pl-1', name: 'Chill Vibes', track_count: 5 },
    ];
    const nav = new SidebarNavigationManager('playlists', playlists);
    nav.selectPlaylist('pl-1');

    nav.setActiveTab('search');
    assert.equal(nav.activeTab, 'search');
    assert.equal(nav.selectedPlaylistId, null);
    assert.equal(nav.isPlaylistSelected('pl-1'), false);
  });
});
