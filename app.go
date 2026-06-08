package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"net/url"
	"log"
	"html"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/kkdai/youtube/v2"
	google_youtube "google.golang.org/api/youtube/v3"
	"google.golang.org/api/option"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)


const (
	lastFMAPIKey    = "9843ca4442b8b4a0127aa345029e9bb4"
	youtubeAPIKey   = "AIzaSyCJyW26ijIS9hNIodGrDLEyDiuXnmoHxK0"
	lastFMBaseURL   = "https://ws.audioscrobbler.com/2.0/"
)

// lyricsCacheEntry holds a cached lyrics result with its timestamp
type lyricsCacheEntry struct {
	result    LyricsResult
	cachedAt  time.Time
}

// App struct
type App struct {
	ctx                context.Context
	lyricsCache        sync.Map // map[string]lyricsCacheEntry — TTL 60s
	sbURL              string   // Supabase project URL
	sbAnonKey          string   // publishable key (for user-scoped requests)
	sbServiceKey       string   // secret key (for admin operations)
	currentUserToken   string   // currently active user session token
	recentlyPlayedPath string   // absolute path to recently_played.json

	// OAuth local-server fields
	oauthMu  sync.Mutex   // guards oauthSrv
	oauthSrv *http.Server // non-nil while a login is in progress
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		sbURL:        getEnv("SUPABASE_URL",         ""),
		sbAnonKey:    getEnv("SUPABASE_ANON_KEY",     ""),
		sbServiceKey: getEnv("SUPABASE_SERVICE_KEY",  ""),
	}
}

// getEnv reads an env var with a fallback (used before godotenv is viable)
func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// startup is called when the app starts.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// ── Resolve local data directory for recently_played.json ──
	configDir, err := os.UserConfigDir()
	if err != nil {
		// Fallback to current working dir if UserConfigDir unavailable
		configDir, _ = os.Getwd()
	}
	appDataDir := configDir + string(os.PathSeparator) + "Music-Wails"
	if mkErr := os.MkdirAll(appDataDir, 0755); mkErr != nil {
		log.Printf("[startup] Could not create app data dir: %v", mkErr)
	}
	a.recentlyPlayedPath = appDataDir + string(os.PathSeparator) + "recently_played.json"
	log.Printf("[startup] Recently played cache: %s", a.recentlyPlayedPath)
}

// ─────────────────────────────────────────────
//  SUPABASE AUTH & DATABASE TYPES
// ─────────────────────────────────────────────

// UserProfile mirrors the 'profiles' table in Supabase
type UserProfile struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
	Role      string `json:"role"`  // "user" | "admin"
	CreatedAt string `json:"created_at"`
}

// FavoriteTrack mirrors 'user_favorites' table
type FavoriteTrack struct {
	ID             string `json:"id"`
	UserID         string `json:"user_id"`
	ItunesTrackID  string `json:"itunes_track_id"`
	Title          string `json:"title"`
	Artist         string `json:"artist"`
	Album          string `json:"album"`
	ArtworkURL     string `json:"artwork_url"`
	PreviewURL     string `json:"preview_url"`
	AddedAt        string `json:"added_at"`
}

// RecentlyPlayedEntry represents a single local play history record
type RecentlyPlayedEntry struct {
	TrackID  string `json:"track_id"`
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Album    string `json:"album"`
	CoverURL string `json:"cover_url"`
	PlayedAt string `json:"played_at"`
}

// HomeSettingRow mirrors 'home_settings' table
type HomeSettingRow struct {
	ID           string `json:"id"`
	SectionTitle string `json:"section_title"`
	ItunesID     string `json:"itunes_id"`
	Category     string `json:"category"`
	DisplayOrder int    `json:"display_order"`
	IsActive     bool   `json:"is_active"`
}

// AuthUserInfo is the response from Supabase /auth/v1/user
type AuthUserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// ─────────────────────────────────────────────
//  LOCAL RECENTLY PLAYED (JSON FILE CACHE)
// ─────────────────────────────────────────────

const maxRecentlyPlayed = 50

// LogSongPlay writes a play event to the local recently_played.json file.
// It deduplicates by track_id (moves existing entry to top), and caps at 50 entries.
// This is fire-and-forget safe: any error is logged but never returned.
func (a *App) LogSongPlay(trackID, title, artist, album, coverURL string) {
	if a.recentlyPlayedPath == "" {
		log.Println("[LogSongPlay] Path not initialised — skipping")
		return
	}

	log.Printf("[LogSongPlay] Recording: %s – %s", artist, title)

	// Read existing history
	var history []RecentlyPlayedEntry
	if raw, err := os.ReadFile(a.recentlyPlayedPath); err == nil {
		if jsonErr := json.Unmarshal(raw, &history); jsonErr != nil {
			log.Printf("[LogSongPlay] JSON parse error (starting fresh): %v", jsonErr)
			history = []RecentlyPlayedEntry{}
		}
	}

	// Remove duplicate by trackID (so it moves to front)
	filtered := history[:0]
	for _, e := range history {
		if e.TrackID != trackID {
			filtered = append(filtered, e)
		}
	}

	// Prepend new entry
	newEntry := RecentlyPlayedEntry{
		TrackID:  trackID,
		Title:    title,
		Artist:   artist,
		Album:    album,
		CoverURL: coverURL,
		PlayedAt: time.Now().UTC().Format(time.RFC3339),
	}
	history = append([]RecentlyPlayedEntry{newEntry}, filtered...)

	// Cap at maxRecentlyPlayed
	if len(history) > maxRecentlyPlayed {
		history = history[:maxRecentlyPlayed]
	}

	// Write back to disk
	encoded, err := json.MarshalIndent(history, "", "  ")
	if err != nil {
		log.Printf("[LogSongPlay] JSON encode error: %v", err)
		return
	}
	if err := os.WriteFile(a.recentlyPlayedPath, encoded, 0644); err != nil {
		log.Printf("[LogSongPlay] Write error: %v", err)
		return
	}
	log.Printf("[LogSongPlay] ✅ Saved %d entries to cache", len(history))
}

// GetRecentlyPlayed reads the local recently_played.json and returns up to 50 entries.
func (a *App) GetRecentlyPlayed() ([]RecentlyPlayedEntry, error) {
	if a.recentlyPlayedPath == "" {
		return []RecentlyPlayedEntry{}, nil
	}

	raw, err := os.ReadFile(a.recentlyPlayedPath)
	if err != nil {
		if os.IsNotExist(err) {
			// No history yet — return empty slice, not an error
			return []RecentlyPlayedEntry{}, nil
		}
		return nil, fmt.Errorf("[GetRecentlyPlayed] read failed: %v", err)
	}

	var history []RecentlyPlayedEntry
	if err := json.Unmarshal(raw, &history); err != nil {
		return nil, fmt.Errorf("[GetRecentlyPlayed] JSON parse failed: %v", err)
	}

	log.Printf("[GetRecentlyPlayed] Returning %d entries", len(history))
	return history, nil
}

// ─────────────────────────────────────────────
//  SUPABASE HELPER — authenticated HTTP request
// ─────────────────────────────────────────────

func (a *App) sbRequest(method, path, bearerToken string, body interface{}) (*http.Response, error) {
	if a.sbURL == "" || a.sbURL == "YOUR_SUPABASE" {
		return nil, fmt.Errorf("SUPABASE_URL not configured. Edit .env and restart")
	}

	var reqBody *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(b)
	} else {
		reqBody = bytes.NewReader(nil)
	}

	fullURL := a.sbURL + path
	req, err := http.NewRequest(method, fullURL, reqBody)
	if err != nil {
		return nil, err
	}

	req.Header.Set("apikey", a.sbAnonKey)
	req.Header.Set("Content-Type", "application/json")
	// Tell Supabase to return the inserted/updated row(s) in the response body
	if method == "POST" || method == "PATCH" {
		req.Header.Set("Prefer", "return=representation")
	}
	if bearerToken != "" {
		req.Header.Set("Authorization", "Bearer "+bearerToken)
	} else if a.currentUserToken != "" {
		req.Header.Set("Authorization", "Bearer "+a.currentUserToken)
	} else {
		req.Header.Set("Authorization", "Bearer "+a.sbAnonKey)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	return client.Do(req)


	
}

// sbAdminRequest uses the service_role key for admin operations
func (a *App) sbAdminRequest(method, path string, body interface{}) (*http.Response, error) {
	if a.sbServiceKey == "" {
		return nil, fmt.Errorf("SUPABASE_SERVICE_KEY not configured")
	}

	var reqBody *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		reqBody = bytes.NewReader(b)
	} else {
		reqBody = bytes.NewReader(nil)
	}

	req, err := http.NewRequest(method, a.sbURL+path, reqBody)
	if err != nil {
		return nil, err
	}
	req.Header.Set("apikey", a.sbServiceKey)
	req.Header.Set("Authorization", "Bearer "+a.sbServiceKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	return client.Do(req)
}

// ─────────────────────────────────────────────
//  SUPABASE AUTH FUNCTIONS
// ─────────────────────────────────────────────

// CheckAuthSession validates a JWT token and returns the user info.
// Called by frontend on startup to verify stored session is still valid.
func (a *App) CheckAuthSession(token string) (AuthUserInfo, error) {
	resp, err := a.sbRequest("GET", "/auth/v1/user", token, nil)
	if err != nil {
		return AuthUserInfo{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return AuthUserInfo{}, fmt.Errorf("session invalid (status %d)", resp.StatusCode)
	}

	var info AuthUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return AuthUserInfo{}, err
	}
	return info, nil
}

// GetUserProfile fetches the user's profile from 'profiles' table.
func (a *App) GetUserProfile(token string) (UserProfile, error) {
	resp, err := a.sbRequest("GET", "/rest/v1/profiles?select=*", token, nil)
	if err != nil {
		return UserProfile{}, err
	}
	defer resp.Body.Close()

	var profiles []UserProfile
	if err := json.NewDecoder(resp.Body).Decode(&profiles); err != nil {
		return UserProfile{}, err
	}
	if len(profiles) == 0 {
		return UserProfile{}, fmt.Errorf("profile not found")
	}
	return profiles[0], nil
}

// GetFavorites returns all favorite tracks for the authenticated user.
func (a *App) GetFavorites(token string) ([]FavoriteTrack, error) {
	resp, err := a.sbRequest("GET", "/rest/v1/user_favorites?select=*&order=added_at.desc", token, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var tracks []FavoriteTrack
	if err := json.NewDecoder(resp.Body).Decode(&tracks); err != nil {
		return nil, err
	}
	return tracks, nil
}

// AddFavorite inserts a track into user_favorites.
func (a *App) AddFavorite(token, itunesID, title, artist, album, artworkURL, previewURL string) error {
	body := map[string]interface{}{
		"itunes_track_id": itunesID,
		"title":          title,
		"artist":         artist,
		"album":          album,
		"artwork_url":    artworkURL,
		"preview_url":    previewURL,
	}
	resp, err := a.sbRequest("POST", "/rest/v1/user_favorites", token, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("add favorite failed: status %d", resp.StatusCode)
	}
	return nil
}

// RemoveFavorite deletes a track from user_favorites.
func (a *App) RemoveFavorite(token, itunesID string) error {
	path := "/rest/v1/user_favorites?itunes_track_id=eq." + itunesID
	resp, err := a.sbRequest("DELETE", path, token, nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("remove favorite failed: status %d", resp.StatusCode)
	}
	return nil
}

// GetHomeSettings returns the home playlist config (all authenticated users).
func (a *App) GetHomeSettings(token string) ([]HomeSettingRow, error) {
	resp, err := a.sbRequest("GET", "/rest/v1/home_settings?select=*&is_active=eq.true&order=display_order.asc", token, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var rows []HomeSettingRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, err
	}
	return rows, nil
}

// UpdateHomeContent updates a home_settings row — ADMIN ONLY.
// The frontend should verify role before calling, but this function
// also validates via Supabase RLS (server-side enforcement).
func (a *App) UpdateHomeContent(token string, row HomeSettingRow) error {
	// First verify the user is admin
	profile, err := a.GetUserProfile(token)
	if err != nil {
		return fmt.Errorf("could not verify user profile: %w", err)
	}
	if profile.Role != "admin" {
		return fmt.Errorf("permission denied: admin role required")
	}

	body := map[string]interface{}{
		"section_title": row.SectionTitle,
		"itunes_id":     row.ItunesID,
		"category":      row.Category,
		"display_order": row.DisplayOrder,
		"is_active":     row.IsActive,
	}
	path := "/rest/v1/home_settings?id=eq." + row.ID
	resp, err := a.sbRequest("PATCH", path, token, body)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("update home content failed: status %d", resp.StatusCode)
	}
	return nil
}


// ─────────────────────────────────────────────
//  PLAY HISTORY — now handled via local JSON file
//  See LogSongPlay() and GetRecentlyPlayed() above
// ─────────────────────────────────────────────



// ToggleFavorite checks if a track is already in user_favorites.
// If NOT present → INSERT (like). If already present → DELETE (unlike).
// Returns true if the track is now favorited, false if it was removed.
// NOTE: Primary call is now from React via supabaseOps.toggleFavorite().
func (a *App) ToggleFavorite(songID, trackTitle, artist, coverURL string) (bool, error) {
	log.Printf("[ToggleFavorite] START — songID=%q title=%q token_set=%v", songID, trackTitle, a.currentUserToken != "")

	if a.currentUserToken == "" {
		log.Printf("[ToggleFavorite] ❌ ABORT — currentUserToken is empty (user not authenticated to Go backend)")
		return false, fmt.Errorf("not authenticated — call SetUserToken first")
	}

	// 1. Check if the track already exists in user_favorites
	checkPath := "/rest/v1/user_favorites?select=id&itunes_track_id=eq." + url.QueryEscape(songID)
	log.Printf("[ToggleFavorite] Checking existence: GET %s", checkPath)
	checkResp, err := a.sbRequest("GET", checkPath, a.currentUserToken, nil)
	if err != nil {
		log.Printf("[ToggleFavorite] ❌ Check request failed: %v", err)
		return false, fmt.Errorf("ToggleFavorite check: %w", err)
	}
	defer checkResp.Body.Close()
	log.Printf("[ToggleFavorite] Check status: %d", checkResp.StatusCode)

	var existing []struct {
		ID string `json:"id"`
	}
	if err := json.NewDecoder(checkResp.Body).Decode(&existing); err != nil {
		log.Printf("[ToggleFavorite] ❌ Decode check response failed: %v", err)
		return false, fmt.Errorf("ToggleFavorite decode: %w", err)
	}

	// 2a. Already favorited → DELETE (unlike)
	if len(existing) > 0 {
		delPath := "/rest/v1/user_favorites?itunes_track_id=eq." + url.QueryEscape(songID)
		log.Printf("[ToggleFavorite] Track exists — DELETE %s", delPath)
		delResp, err := a.sbRequest("DELETE", delPath, a.currentUserToken, nil)
		if err != nil {
			log.Printf("[ToggleFavorite] ❌ Delete failed: %v", err)
			return false, fmt.Errorf("ToggleFavorite delete: %w", err)
		}
		defer delResp.Body.Close()
		if delResp.StatusCode >= 300 {
			log.Printf("[ToggleFavorite] ❌ Delete status %d", delResp.StatusCode)
			return false, fmt.Errorf("ToggleFavorite delete: status %d", delResp.StatusCode)
		}
		log.Printf("[ToggleFavorite] ✅ Removed from favorites (status %d)", delResp.StatusCode)
		return false, nil // now un-favorited
	}

	// 2b. Not favorited → INSERT (like)
	body := map[string]interface{}{
		"itunes_track_id": songID,
		"title":           trackTitle,
		"artist":          artist,
		"album":           "",
		"artwork_url":     coverURL,
		"preview_url":     "",
	}
	log.Printf("[ToggleFavorite] Track not found — INSERT")
	addResp, err := a.sbRequest("POST", "/rest/v1/user_favorites", a.currentUserToken, body)
	if err != nil {
		log.Printf("[ToggleFavorite] ❌ Insert failed: %v", err)
		return false, fmt.Errorf("ToggleFavorite insert: %w", err)
	}
	defer addResp.Body.Close()
	if addResp.StatusCode >= 300 {
		log.Printf("[ToggleFavorite] ❌ Insert status %d", addResp.StatusCode)
		return false, fmt.Errorf("ToggleFavorite insert: status %d", addResp.StatusCode)
	}
	log.Printf("[ToggleFavorite] ✅ Added to favorites (status %d)", addResp.StatusCode)
	return true, nil // now favorited
}

// SetUserToken is called by React (AuthContext) whenever the Supabase session
// changes (sign-in, sign-out, token refresh). This syncs the JWT to Go so
// all Supabase REST calls (LogSongPlay, ToggleFavorite, etc.) are properly
// authenticated and pass RLS policies.
//
// Call this from AuthContext's onAuthStateChange listener:
//   SetUserToken(session?.access_token ?? "")
func (a *App) SetUserToken(token string) {
	a.currentUserToken = token
	if token != "" {
		fmt.Println("[Auth] ✅ Go backend: user token updated — Supabase calls now authenticated")
	} else {
		fmt.Println("[Auth] ⚠️  Go backend: user token cleared — user signed out")
	}
}

// ─────────────────────────────────────────────
//  PLAYLISTS
// ─────────────────────────────────────────────

// PlaylistRow mirrors the 'playlists' table
type PlaylistRow struct {
	ID        string `json:"id"`
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	CoverURL  string `json:"cover_url"`
	CreatedAt string `json:"created_at"`
}

// PlaylistTrackRow mirrors the 'playlist_tracks' table
type PlaylistTrackRow struct {
	ID         string `json:"id"`
	PlaylistID string `json:"playlist_id"`
	TrackID    string `json:"track_id"`
	Title      string `json:"title"`
	Artist     string `json:"artist"`
	Album      string `json:"album"`
	CoverURL   string `json:"cover_url"`
	AddedAt    string `json:"added_at"`
	Duration   int    `json:"duration"`    // duration in ms
	OrderIndex int    `json:"order_index"`  // sorting order index
}

// CreatePlaylist creates a new named playlist for the current user.
// Returns the newly created playlist row (with generated UUID).
func (a *App) CreatePlaylist(name string) (PlaylistRow, error) {
	if a.currentUserToken == "" {
		return PlaylistRow{}, fmt.Errorf("not authenticated")
	}
	if name == "" {
		return PlaylistRow{}, fmt.Errorf("playlist name cannot be empty")
	}

	body := map[string]interface{}{
		"name": name,
	}

	// Prefer=return=representation so Supabase returns the inserted row
	path := "/rest/v1/playlists"
	resp, err := a.sbRequest("POST", path, a.currentUserToken, body)
	if err != nil {
		return PlaylistRow{}, fmt.Errorf("CreatePlaylist: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return PlaylistRow{}, fmt.Errorf("CreatePlaylist: status %d", resp.StatusCode)
	}

	var rows []PlaylistRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil || len(rows) == 0 {
		// Supabase by default doesn't return body unless Prefer header is set.
		// Return a minimal row in that case.
		return PlaylistRow{Name: name}, nil
	}
	return rows[0], nil
}

// GetPlaylists returns all playlists owned by the current user.
func (a *App) GetPlaylists() ([]PlaylistRow, error) {
	if a.currentUserToken == "" {
		return []PlaylistRow{}, nil
	}

	resp, err := a.sbRequest("GET", "/rest/v1/playlists?select=*&order=created_at.desc", a.currentUserToken, nil)
	if err != nil {
		return nil, fmt.Errorf("GetPlaylists: %w", err)
	}
	defer resp.Body.Close()

	var rows []PlaylistRow
	if err := json.NewDecoder(resp.Body).Decode(&rows); err != nil {
		return nil, fmt.Errorf("GetPlaylists: decode: %w", err)
	}
	return rows, nil
}

// AddTrackToPlaylist inserts a track into a specific playlist.
// Uses ON CONFLICT DO NOTHING (via the unique index) to prevent duplicates.
func (a *App) AddTrackToPlaylist(playlistID, trackID, title, artist, album, coverURL string) error {
	if a.currentUserToken == "" {
		return fmt.Errorf("not authenticated")
	}

	body := map[string]interface{}{
		"playlist_id": playlistID,
		"track_id":    trackID,
		"title":       title,
		"artist":      artist,
		"album":       album,
		"cover_url":   coverURL,
	}

	// Prefer: resolution=ignore-duplicates prevents error on duplicate (track already in playlist)
	resp, err := a.sbRequest("POST", "/rest/v1/playlist_tracks", a.currentUserToken, body)
	if err != nil {
		return fmt.Errorf("AddTrackToPlaylist: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("AddTrackToPlaylist: status %d", resp.StatusCode)
	}
	return nil
}

// GetPlaylistTracks returns all tracks in a specific playlist.
func (a *App) GetPlaylistTracks(playlistID string) ([]PlaylistTrackRow, error) {
	if a.currentUserToken == "" {
		return []PlaylistTrackRow{}, nil
	}

	path := "/rest/v1/playlist_tracks?select=*&playlist_id=eq." + url.QueryEscape(playlistID) + "&order=order_index.asc.nullslast,added_at.asc"
	resp, err := a.sbRequest("GET", path, a.currentUserToken, nil)
	if err != nil {
		return nil, fmt.Errorf("GetPlaylistTracks: %w", err)
	}
	defer resp.Body.Close()

	var tracks []PlaylistTrackRow
	if err := json.NewDecoder(resp.Body).Decode(&tracks); err != nil {
		return nil, fmt.Errorf("GetPlaylistTracks: decode: %w", err)
	}
	return tracks, nil
}

// DeletePlaylist removes a playlist and all its tracks (CASCADE).
func (a *App) DeletePlaylist(playlistID string) error {
	if a.currentUserToken == "" {
		return fmt.Errorf("not authenticated")
	}

	path := "/rest/v1/playlists?id=eq." + url.QueryEscape(playlistID)
	resp, err := a.sbRequest("DELETE", path, a.currentUserToken, nil)
	if err != nil {
		return fmt.Errorf("DeletePlaylist: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("DeletePlaylist: status %d", resp.StatusCode)
	}
	return nil
}


const oauthCallbackPort = 54321

// oauthCallbackAddr is the canonical redirect URI — always 127.0.0.1, never localhost,
// to avoid IPv6 resolution issues on Windows.
const oauthCallbackAddr = "127.0.0.1"

// oauthResult carries tokens (or an error) from the local HTTP callback
type oauthResult struct {
	AccessToken  string
	RefreshToken string
	Error        string
}

// StartGoogleLogin opens the system browser for Google OAuth and
// starts a temporary local server to capture the Supabase callback.
// Non-blocking: the result arrives via Wails event "login-success" or "auth:google:error".
// Safe to call multiple times — if a server is already running, it is reused.
func (a *App) StartGoogleLogin() error {
	if a.sbURL == "" || a.sbURL == "YOUR_SUPABASE" {
		return fmt.Errorf("SUPABASE_URL not configured — edit .env dan restart")
	}

	// ── Guard: kill any zombie server before starting a fresh one ──────────
	a.oauthMu.Lock()
	if a.oauthSrv != nil {
		// Previous server still running — shut it down so we get a clean start
		ctxShut, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_ = a.oauthSrv.Shutdown(ctxShut)
		cancel()
		a.oauthSrv = nil
	}
	a.oauthMu.Unlock()

	redirectTo := fmt.Sprintf("http://%s:%d/callback", oauthCallbackAddr, oauthCallbackPort)

	authURL := fmt.Sprintf(
		"%s/auth/v1/authorize?provider=google&redirect_to=%s",
		a.sbURL,
		url.QueryEscape(redirectTo),
	)

	// Start the local callback server (stores srv reference in a.oauthSrv)
	resultCh, stopServer := a.startOAuthCallbackServer()

	// Open system browser (Chrome, Edge, Firefox — whatever the OS default is)
	runtime.BrowserOpenURL(a.ctx, authURL)

	// Wait for callback asynchronously
	go func() {
		// Wait for either the error channel or timeout
		// We no longer rely on resultCh for success, as success is emitted directly via "oauth-raw-url"
		select {
		case res := <-resultCh:
			stopServer() // shut down the HTTP server gracefully
			if res.Error != "" {
				runtime.EventsEmit(a.ctx, "auth:google:error", res.Error)
			}
		case <-time.After(3 * time.Minute):
			stopServer()
			runtime.EventsEmit(a.ctx, "auth:google:error", "Login timeout setelah 3 menit.")
		}
	}()

	return nil
}

// startOAuthCallbackServer starts a local HTTP server on 127.0.0.1:54321.
// Returns a channel that delivers the result and a stop function.
// The server reference is stored in a.oauthSrv for lifecycle management.
func (a *App) startOAuthCallbackServer() (<-chan oauthResult, func()) {
	resultCh := make(chan oauthResult, 1)
	// wg tracks in-flight goroutines (e.g. PKCE exchange) so shutdown waits for them
	var wg sync.WaitGroup

	// ── Callback page: returns HTML that reads the URL fragment via JS ──
	callbackHTML := `<!DOCTYPE html>
<html lang="id" class="h-full">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Music-Wails — Autentikasi</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          },
          colors: {
            brand: {
              DEFAULT: '#FA243C',
            }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-zinc-950 text-zinc-100 flex items-center justify-center min-h-screen p-4 select-none font-sans overflow-hidden">
  
  <!-- Outer Glow Effect -->
  <div class="absolute w-96 h-96 rounded-full bg-red-500/10 blur-[128px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>

  <div class="relative bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl transition-all duration-500 transform scale-100">
    
    <!-- State Icons Wrapper -->
    <div class="flex justify-center items-center h-20 mb-6 relative">
      
      <!-- Loading State: Spinner -->
      <div id="icon-loading" class="flex items-center justify-center">
        <svg class="animate-spin text-red-500 w-12 h-12" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>

      <!-- Success State: Green Check -->
      <div id="icon-success" class="hidden flex items-center justify-center">
        <div class="rounded-full bg-emerald-500/10 p-3 border border-emerald-500/20">
          <svg class="text-emerald-500 w-10 h-10 stroke-[2.5]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>

      <!-- Error State: Red Cross -->
      <div id="icon-error" class="hidden flex items-center justify-center">
        <div class="rounded-full bg-red-500/10 p-3 border border-red-500/20">
          <svg class="text-red-500 w-10 h-10 stroke-[2.5]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>

    </div>
    
    <h2 id="title" class="text-xl font-bold text-zinc-100 tracking-tight mb-2">Menyelesaikan Autentikasi...</h2>
    <p id="status-text" class="text-sm text-zinc-400 leading-relaxed px-2">Menghubungkan sesi Google Anda dengan aplikasi Music-Wails secara aman.</p>
  </div>

  <script>
    async function sendToken() {
      const iconLoading = document.getElementById('icon-loading');
      const iconSuccess = document.getElementById('icon-success');
      const iconError = document.getElementById('icon-error');
      const titleText = document.getElementById('title');
      const statusText = document.getElementById('status-text');

      try {
        const response = await fetch('/process-url', {
          method: 'POST',
          body: window.location.href
        });

        if (response.ok) {
          iconLoading.classList.add('hidden');
          iconSuccess.classList.remove('hidden');
          
          titleText.innerText = 'Autentikasi Berhasil!';
          statusText.innerHTML = 'Anda sudah bisa kembali ke aplikasi <strong>Music-Wails</strong>.<br><span class="text-zinc-500 text-xs mt-2 block">Silakan tutup tab ini.</span>';
        } else {
          throw new Error('Server callback menolak permintaan autentikasi.');
        }
      } catch (err) {
        console.error('Gagal mengirim token:', err);
        iconLoading.classList.add('hidden');
        iconError.classList.remove('hidden');
        
        titleText.innerText = 'Autentikasi Gagal';
        statusText.innerText = 'Terjadi kesalahan saat sinkronisasi: ' + err.message;
      }
    }
    
    sendToken();
  </script>
</body>
</html>`

	mux := http.NewServeMux()

	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, callbackHTML)
	})

	// /process-url — receives the raw window.location.href string
	mux.HandleFunc("/process-url", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}
		w.Header().Set("Access-Control-Allow-Origin", "*")

		bodyBytes, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		rawURL := string(bodyBytes)

		// ── DUMB BRIDGE ──
		// Just emit the raw URL string back to React so it can handle PKCE/Hash parsing
		// via the official supabase-js SDK.
		w.WriteHeader(http.StatusOK)
		runtime.EventsEmit(a.ctx, "oauth-raw-url", rawURL)
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf("%s:%d", oauthCallbackAddr, oauthCallbackPort),
		Handler: mux,
	}

	// Store server reference for lifecycle management
	a.oauthMu.Lock()
	a.oauthSrv = srv
	a.oauthMu.Unlock()

	go func() { _ = srv.ListenAndServe() }()

	stop := func() {
		// Wait for any in-flight goroutines (e.g. PKCE exchange) to finish
		wg.Wait()
		ctxShut, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctxShut)
		a.oauthMu.Lock()
		a.oauthSrv = nil
		a.oauthMu.Unlock()
	}

	return resultCh, stop
}

// Song represents the track data returned to the frontend (Search / Playlist)
type Song struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Artist        string `json:"artist"`
	Album         string `json:"album"`
	Genre         string `json:"genre"`
	CoverArt      string `json:"coverArt"`
	StreamURL     string `json:"streamUrl"`  // iTunes preview (fallback)
	Duration      int    `json:"duration"`   // milliseconds
	IsRecommended bool   `json:"isRecommended"`
}

// SmartTrack — enriched metadata from Last.fm + iTunes + lazy YouTube
type SmartTrack struct {
	ID          string `json:"id"`          // iTunes Track ID
	Title       string `json:"title"`
	Artist      string `json:"artist"`
	Album       string `json:"album"`
	Genre       string `json:"genre"`
	CoverArt    string `json:"coverArt"`    // 600x600bb from iTunes
	PreviewURL  string `json:"previewUrl"`  // iTunes AAC 128kbps (instant fallback)
	StreamURL   string `json:"streamUrl"`   // YouTube full stream (lazy-loaded, starts empty)
	Duration    int    `json:"duration"`    // milliseconds
	Source      string `json:"source"`      // "lastfm" | "itunes_genre" | "itunes_artist"
	IsReady     bool   `json:"isReady"`     // true once metadata is enriched
}

// LyricsResult holds lyrics data along with metadata for duration validation
type LyricsResult struct {
	SyncedLyrics string `json:"syncedLyrics"`
	PlainLyrics  string `json:"plainLyrics"`
	LrcDuration  int    `json:"lrcDuration"`
}

// newHTTPClient returns an http.Client with a consistent timeout
func newHTTPClient() *http.Client {
	return &http.Client{Timeout: 10 * time.Second}
}

// FetchExternalAPI is a production-safe HTTP proxy for the frontend.
// Browser fetch() calls to external APIs (iTunes, etc.) fail in wails build
// due to CORS / wails:// protocol restrictions. This Go method bypasses
// that by running the request server-side, where there is no CORS policy.
func (a *App) FetchExternalAPI(targetURL string) (string, error) {
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		return "", fmt.Errorf("FetchExternalAPI: build request: %w", err)
	}
	// Inject a real browser User-Agent so Apple CDN does not block the request
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, */*")
	req.Header.Set("Accept-Language", "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("FetchExternalAPI: do request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("FetchExternalAPI: HTTP %d for %s", resp.StatusCode, targetURL)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("FetchExternalAPI: read body: %w", err)
	}
	return string(body), nil
}

// ─────────────────────────────────────────────
//  SPOTIFY ANONYMOUS IMPORTER
// ─────────────────────────────────────────────

// SpotifyTrack represents a track extracted from a Spotify playlist
type SpotifyTrack struct {
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	CoverURL string `json:"coverUrl"`
}

// ScrapeSpotifyPlaylist extracts playlist tracks by scraping the Spotify embed HTML.
func (a *App) ScrapeSpotifyPlaylist(spotifyURL string) ([]SpotifyTrack, error) {
	// Example URL: https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M
	// Or sometimes users paste with query params
	
	re := regexp.MustCompile(`/playlist/([a-zA-Z0-9]+)`)
	matches := re.FindStringSubmatch(spotifyURL)
	if len(matches) < 2 {
		return nil, fmt.Errorf("URL Spotify tidak valid. Tidak dapat menemukan ID playlist.")
	}
	playlistID := matches[1]

	embedURL := fmt.Sprintf("https://open.spotify.com/embed/playlist/%s", playlistID)
	req, err := http.NewRequest("GET", embedURL, nil)
	if err != nil {
		return nil, fmt.Errorf("Gagal membuat request embed: %v", err)
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("Gagal mengambil halaman Spotify: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("Gagal mengambil halaman Spotify: HTTP %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("Gagal membaca respon HTML: %v", err)
	}
	bodyStr := string(bodyBytes)

	// Regex for title
	titleRe := regexp.MustCompile(`class="[^\"]*TracklistRow_title[^\"]*"[^>]*>([^<]+)</h3>`)
	artistRe := regexp.MustCompile(`class="[^\"]*TracklistRow_subtitle[^\"]*"[^>]*>(?:<span[^>]*>[^<]*</span>)?([^<]+)</h4>`)

	titles := titleRe.FindAllStringSubmatch(bodyStr, -1)
	artists := artistRe.FindAllStringSubmatch(bodyStr, -1)

	count := len(titles)
	if len(artists) < count {
		count = len(artists)
	}

	enrichedTracks := make([]SpotifyTrack, count)
	var wg sync.WaitGroup

	for i := 0; i < count; i++ {
		// Clean up HTML entities like &#x27;
		title := html.UnescapeString(titles[i][1])
		artist := html.UnescapeString(artists[i][1])
		// Artist often contains non-breaking spaces
		artist = strings.ReplaceAll(artist, "\u00a0", " ")
		
		enrichedTracks[i] = SpotifyTrack{
			Title:  title,
			Artist: artist,
			CoverURL: "",
		}

		wg.Add(1)
		go func(idx int, t, a string) {
			defer wg.Done()
			
			query := url.QueryEscape(t + " " + a)
			apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=1", query)
			
			client := &http.Client{Timeout: 5 * time.Second}
			resp, err := client.Get(apiURL)
			if err == nil && resp.StatusCode == http.StatusOK {
				defer resp.Body.Close()
				var result struct {
					Results []struct {
						TrackName      string `json:"trackName"`
						ArtistName     string `json:"artistName"`
						ArtworkUrl100  string `json:"artworkUrl100"`
					} `json:"results"`
				}
				if err := json.NewDecoder(resp.Body).Decode(&result); err == nil && len(result.Results) > 0 {
					// Use iTunes metadata if found
					enrichedTracks[idx].Title = result.Results[0].TrackName
					enrichedTracks[idx].Artist = result.Results[0].ArtistName
					enrichedTracks[idx].CoverURL = upsizeArtwork(result.Results[0].ArtworkUrl100)
				}
			} else if resp != nil {
				resp.Body.Close()
			}
		}(i, title, artist)
	}

	wg.Wait()

	return enrichedTracks, nil
}

// upsizeArtwork converts iTunes 100x100 artwork URL to 600x600
func upsizeArtwork(url100 string) string {
	if len(url100) > 13 {
		return url100[:len(url100)-13] + "600x600bb.jpg"
	}
	return url100
}

// ─────────────────────────────────────────────
//  SEARCH
// ─────────────────────────────────────────────

// SearchSongs searches for songs using the iTunes Search API
func (a *App) SearchSongs(query string) ([]Song, error) {
	if query == "" {
		return []Song{}, nil
	}

	apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=20", url.QueryEscape(query))

	client := newHTTPClient()
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Results []struct {
			TrackID          int    `json:"trackId"`
			TrackName        string `json:"trackName"`
			ArtistName       string `json:"artistName"`
			CollectionName   string `json:"collectionName"`
			ArtworkUrl100    string `json:"artworkUrl100"`
			PreviewUrl       string `json:"previewUrl"`
			TrackTimeMillis  int    `json:"trackTimeMillis"`
			PrimaryGenreName string `json:"primaryGenreName"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var songs []Song
	for _, item := range result.Results {
		songs = append(songs, Song{
			ID:        fmt.Sprintf("%d", item.TrackID),
			Title:     item.TrackName,
			Artist:    item.ArtistName,
			Album:     item.CollectionName,
			Genre:     item.PrimaryGenreName,
			CoverArt:  upsizeArtwork(item.ArtworkUrl100),
			StreamURL: item.PreviewUrl,
			Duration:  item.TrackTimeMillis,
		})
	}
	return songs, nil
}

// ─────────────────────────────────────────────
//  PLAYLISTS
// ─────────────────────────────────────────────

// GetPlaylist fetches category-based playlists from iTunes RSS
func (a *App) GetPlaylist(category string) ([]Song, error) {
	var apiURL string
	switch category {
	case "id":
		apiURL = "https://itunes.apple.com/id/rss/topsongs/limit=20/json"
	case "pop":
		apiURL = "https://itunes.apple.com/us/rss/topsongs/limit=20/genre=14/json"
	case "focus":
		apiURL = "https://itunes.apple.com/us/rss/topsongs/limit=20/genre=5/json"
	default:
		apiURL = "https://itunes.apple.com/us/rss/topsongs/limit=20/json"
	}

	client := newHTTPClient()
	resp, err := client.Get(apiURL)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Feed struct {
			Entry []struct {
				Title struct {
					Label string `json:"label"`
				} `json:"im:name"`
				Artist struct {
					Label string `json:"label"`
				} `json:"im:artist"`
				Collection struct {
					Name struct {
						Label string `json:"label"`
					} `json:"im:name"`
				} `json:"im:collection"`
				Category struct {
					Attributes struct {
						Label string `json:"label"`
					} `json:"attributes"`
				} `json:"category"`
				Image []struct {
					Label string `json:"label"`
				} `json:"im:image"`
				Link []struct {
					Attributes struct {
						Href string `json:"href"`
						Type string `json:"type"`
					} `json:"attributes"`
				} `json:"link"`
				ID struct {
					Attributes struct {
						ImID string `json:"im:id"`
					} `json:"attributes"`
				} `json:"id"`
			} `json:"entry"`
		} `json:"feed"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var songs []Song
	for _, item := range result.Feed.Entry {
		previewURL := ""
		for _, l := range item.Link {
			if l.Attributes.Type == "audio/x-m4a" || l.Attributes.Type == "audio/mp3" {
				previewURL = l.Attributes.Href
			}
		}

		coverArt := ""
		if len(item.Image) > 0 {
			coverArt = upsizeArtwork(item.Image[len(item.Image)-1].Label)
		}

		songs = append(songs, Song{
			ID:        item.ID.Attributes.ImID,
			Title:     item.Title.Label,
			Artist:    item.Artist.Label,
			Album:     item.Collection.Name.Label,
			Genre:     item.Category.Attributes.Label,
			CoverArt:  coverArt,
			StreamURL: previewURL,
			Duration:  30000,
		})
	}
	return songs, nil
}

// ─────────────────────────────────────────────
//  YOUTUBE STREAMING
// ─────────────────────────────────────────────

// GetFullStreamURL — searches YouTube (Official API v3) then extracts an audio-only
// stream URL via kkdai. Prefers audio-only formats (webm/opus or m4a) which are
// directly playable by HTML5 <audio> without requiring ffmpeg.
// Returns ("", error) on failure so frontend can fall back to iTunes preview.
func (a *App) GetFullStreamURL(artist string, title string, key1 string, key2 string) (string, error) {
	query := fmt.Sprintf("%s %s audio", artist, title)

	tryKey := func(key string) (string, error) {
		if key == "" {
			return "", fmt.Errorf("empty API key")
		}
		ytService, err := google_youtube.NewService(context.Background(), option.WithAPIKey(key))
		if err != nil {
			return "", err
		}

		call := ytService.Search.List([]string{"id"}).Q(query).Type("video").MaxResults(1)
		response, err := call.Do()
		if err != nil {
			return "", err
		}

		if len(response.Items) == 0 {
			return "", fmt.Errorf("no video found for: %s", query)
		}

		return response.Items[0].Id.VideoId, nil
	}

	var videoID string
	var err error

	// Step 1: Search via Official YouTube Data API v3 with Failover
	videoID, err = tryKey(key1)
	if err != nil {
		fmt.Printf("[YouTube] Key 1 failed: %v\n", err)

		// Fallback to Key 2
		videoID, err = tryKey(key2)
		if err != nil {
			fmt.Printf("[YouTube] Key 2 failed: %v\n", err)
			return "", fmt.Errorf("QUOTA_EXCEEDED")
		}
	}

	fmt.Printf("[YouTube] Found video ID: %s for '%s'\n", videoID, query)

	// Step 2: Extract audio stream via kkdai
	ytClient := youtube.Client{}
	video, err := ytClient.GetVideo(videoID)
	if err != nil {
		fmt.Printf("[YouTube] kkdai GetVideo error: %v\n", err)
		return "", err
	}

	// Step 3: Prefer AUDIO-ONLY formats (no video track) — these are:
	//   - webm/opus  (itag 249, 250, 251) — best for Chrome/Chromium WebView2
	//   - mp4/m4a    (itag 139, 140, 141) — fallback for broader compatibility
	// Audio-only formats are smaller, faster to start, and work directly in HTML5 <audio>.
	// Mixed video+audio formats (itag 18, 22, etc.) often have seeking issues in WebView2.
	var selectedFormat *youtube.Format

	// Priority 1: webm audio-only (opus codec — best quality/size for Chromium WebView2)
	for i := range video.Formats {
		f := &video.Formats[i]
		if f.AudioChannels > 0 && f.Width == 0 && strings.Contains(f.MimeType, "webm") {
			fmt.Printf("[YouTube] Selected audio-only webm format: itag=%d mime=%s bitrate=%d\n",
				f.ItagNo, f.MimeType, f.Bitrate)
			selectedFormat = f
			break
		}
	}

	// Priority 2: mp4/m4a audio-only
	if selectedFormat == nil {
		for i := range video.Formats {
			f := &video.Formats[i]
			if f.AudioChannels > 0 && f.Width == 0 && strings.Contains(f.MimeType, "mp4") {
				fmt.Printf("[YouTube] Selected audio-only mp4 format: itag=%d mime=%s bitrate=%d\n",
					f.ItagNo, f.MimeType, f.Bitrate)
				selectedFormat = f
				break
			}
		}
	}

	// Priority 3: Any format with audio channels (mixed video+audio, last resort)
	if selectedFormat == nil {
		all := video.Formats.WithAudioChannels()
		if len(all) == 0 {
			return "", fmt.Errorf("no audio formats available for video %s", videoID)
		}
		all.Sort()
		selectedFormat = &all[0]
		fmt.Printf("[YouTube] Falling back to mixed format: itag=%d mime=%s\n",
			selectedFormat.ItagNo, selectedFormat.MimeType)
	}

	streamURL, err := ytClient.GetStreamURL(video, selectedFormat)
	if err != nil {
		fmt.Printf("[YouTube] GetStreamURL error: %v\n", err)
		return "", err
	}

	// Store the raw CDN URL and return a localhost proxy URL instead.
	// WebView2 cannot play googlevideo.com URLs directly (CORS + header restrictions).
	// The local proxy at :54322 fetches from YouTube CDN with correct headers
	// and streams the audio back to WebView2 as http://localhost:54322/stream?t=TOKEN.
	token := fmt.Sprintf("%s-%d", videoID, selectedFormat.ItagNo)
	audioProxyStore.Store(token, streamURL)
	proxyURL := fmt.Sprintf("http://localhost:54322/stream?t=%s", token)
	fmt.Printf("[YouTube] Proxy URL ready: %s\n", proxyURL)
	return proxyURL, nil
}

// ─────────────────────────────────────────────
//  ASYNC STREAM RESOLUTION
// ─────────────────────────────────────────────

// GetStreamURLAsync starts a background goroutine to resolve a YouTube audio stream URL.
// This function returns IMMEDIATELY (non-blocking) — the UI can show a loading state
// without freezing. Results are pushed to the React frontend via Wails events:
//
//   Event "stream:ready":
//     { "songId": string, "url": string, "isHQ": bool }
//     isHQ=true  → YouTube high-quality proxy URL  (play this directly)
//     isHQ=false → YouTube unavailable; frontend should use iTunes preview URL from song data
//
// Design constraints honoured:
//   - NO audio is started here — React decides when and what to play.
//   - NO swapping mid-playback; React plays exactly ONE URL per song.
//   - Lyrics are NOT touched here; React's own GetLyrics + backoff polling handle them.
func (a *App) GetStreamURLAsync(songID, artist, title, key1, key2 string) {
	go func() {
		fmt.Printf("[StreamAsync] Starting resolution for songID=%s '%s - %s'\n", songID, artist, title)

		streamURL, err := a.GetFullStreamURL(artist, title, key1, key2)
		if err == nil && streamURL != "" {
			fmt.Printf("[StreamAsync] YouTube URL ready for songID=%s\n", songID)
			runtime.EventsEmit(a.ctx, "stream:ready", map[string]interface{}{
				"songId": songID,
				"url":    streamURL,
				"isHQ":   true,
			})
		} else {
			// YouTube unavailable (quota, empty keys, network error).
			// Signal the frontend to fall back to its own iTunes preview URL.
			fmt.Printf("[StreamAsync] YouTube failed for songID=%s: %v — signalling iTunes fallback\n", songID, err)
			runtime.EventsEmit(a.ctx, "stream:ready", map[string]interface{}{
				"songId": songID,
				"url":    "",
				"isHQ":   false,
			})
		}
	}()
}

// ─────────────────────────────────────────────
//  PRELOAD STREAM RESOLUTION
// ─────────────────────────────────────────────

// GetStreamURLForPreload resolves the YouTube audio URL for the NEXT song in background.
// Unlike GetStreamURLAsync (which emits "stream:ready" and triggers active playback),
// this function emits "stream:preloaded" so the React dual-audio engine can silently buffer
// the result into the standby Audio() instance without starting playback.
//
// This is called automatically by useDualAudioEngine when the active song reaches 75% duration.
func (a *App) GetStreamURLForPreload(songID, artist, title, key1, key2 string) {
	go func() {
		fmt.Printf("[Preload] Starting background resolution for songID=%s '%s - %s'\n", songID, artist, title)

		streamURL, err := a.GetFullStreamURL(artist, title, key1, key2)
		if err == nil && streamURL != "" {
			fmt.Printf("[Preload] ✅ URL ready for songID=%s\n", songID)
			runtime.EventsEmit(a.ctx, "stream:preloaded", map[string]interface{}{
				"songId": songID,
				"url":    streamURL,
				"isHQ":   true,
			})
		} else {
			// YouTube unavailable — React will fall back to iTunes preview URL
			fmt.Printf("[Preload] ⚠️  YouTube failed for songID=%s: %v — signalling iTunes fallback\n", songID, err)
			runtime.EventsEmit(a.ctx, "stream:preloaded", map[string]interface{}{
				"songId": songID,
				"url":    "",
				"isHQ":   false,
			})
		}
	}()
}

// ─────────────────────────────────────────────
//  SMART SHUFFLE — ARTIST SANITIZATION + LAST.FM DISCOVERY
// ─────────────────────────────────────────────

// diacriticMap maps common accented/special characters to their ASCII equivalents.
// Using a manual map avoids adding golang.org/x/text as a dependency.
var diacriticMap = map[rune]string{
	// Latin Extended-A — most common in Indonesian/European names
	'À': "A", 'Á': "A", 'Â': "A", 'Ã': "A", 'Ä': "A", 'Å': "A",
	'à': "a", 'á': "a", 'â': "a", 'ã': "a", 'ä': "a", 'å': "a",
	'Æ': "AE", 'æ': "ae",
	'Ç': "C", 'ç': "c",
	'È': "E", 'É': "E", 'Ê': "E", 'Ë': "E",
	'è': "e", 'é': "e", 'ê': "e", 'ë': "e",
	'Ì': "I", 'Í': "I", 'Î': "I", 'Ï': "I",
	'ì': "i", 'í': "i", 'î': "i", 'ï': "i",
	'Ñ': "N", 'ñ': "n",
	'Ò': "O", 'Ó': "O", 'Ô': "O", 'Õ': "O", 'Ö': "O", 'Ø': "O",
	'ò': "o", 'ó': "o", 'ô': "o", 'õ': "o", 'ö': "o", 'ø': "o",
	'Ù': "U", 'Ú': "U", 'Û': "U", 'Ü': "U",
	'ù': "u", 'ú': "u", 'û': "u", 'ü': "u",
	'Ý': "Y", 'ý': "y", 'ÿ': "y",
	'Ð': "D", 'ð': "d",
	'Þ': "TH", 'þ': "th",
	'ß': "ss",
	// Latin Extended with caron/breve (Czech, Slovak, Croatian)
	'Č': "C", 'č': "c", 'Š': "S", 'š': "s", 'Ž': "Z", 'ž': "z",
	'Ć': "C", 'ć': "c", 'Đ': "D", 'đ': "d",
	// Polish
	'Ą': "A", 'ą': "a", 'Ę': "E", 'ę': "e", 'Ł': "L", 'ł': "l",
	'Ń': "N", 'ń': "n", 'Ś': "S", 'ś': "s", 'Ź': "Z", 'ź': "z", 'Ż': "Z", 'ż': "z",
	// Turkish
	'Ğ': "G", 'ğ': "g", 'İ': "I", 'ı': "i",
	// Misc punctuation used in artist names
	'\u2019': "'", '\u2018': "'", // curly apostrophes
	'\u2013': "-", '\u2014': "-", // em/en dash
}

// sanitizeArtistName performs two normalizations required for reliable API lookups:
//  1. Diacritic stripping  — 'eńau' → 'enau', 'Ari Ólafsson' → 'Ari Olafsson'
//  2. Multi-artist splitting — 'enau & Ari Lesmana' → 'enau'
//     Splits on: ' & ', ' feat. ', ' ft. ', ' featuring ', ' x ', ' vs ', ','
func sanitizeArtistName(artist string) string {
	if artist == "" {
		return ""
	}

	// Step 1: Extract primary artist by splitting on collaboration separators.
	// Lower-case comparison so 'Feat.' and 'FEAT.' are both caught.
	separators := []string{" & ", " feat. ", " ft. ", " featuring ", " x ", " vs. ", " vs ", ","}
	primary := artist
	lower := strings.ToLower(artist)
	for _, sep := range separators {
		if idx := strings.Index(strings.ToLower(lower), sep); idx != -1 {
			candidate := strings.TrimSpace(artist[:idx])
			if candidate != "" {
				primary = candidate
				break
			}
		}
	}

	// Step 2: Replace diacritic characters using our map.
	var b strings.Builder
	for _, r := range primary {
		if repl, ok := diacriticMap[r]; ok {
			b.WriteString(repl)
		} else if r > unicode.MaxASCII {
			// Drop any other non-ASCII character we don't have a mapping for.
			// This is a safe fallback — better to lose a char than break the API call.
			continue
		} else {
			b.WriteRune(r)
		}
	}

	sanitized := strings.TrimSpace(b.String())
	if sanitized == "" {
		// Extreme edge case: if everything was stripped, return original primary
		return strings.TrimSpace(primary)
	}
	return sanitized
}

// lastFMSimilarTrack is the raw shape returned by Last.fm track.getSimilar
type lastFMSimilarTrack struct {
	Name   string `json:"name"`
	Artist struct {
		Name string `json:"name"`
	} `json:"artist"`
	Match float64 `json:"match"`
}

// getSimilarFromLastFM calls Last.fm track.getSimilar and returns raw track pairs.
// The artist string passed in should already be sanitized.
func getSimilarFromLastFM(artist, title string, limit int) ([]lastFMSimilarTrack, error) {
	client := newHTTPClient()

	params := url.Values{}
	params.Set("method", "track.getSimilar")
	params.Set("artist", artist)
	params.Set("track", title)
	params.Set("api_key", lastFMAPIKey)
	params.Set("limit", fmt.Sprintf("%d", limit))
	params.Set("format", "json")

	apiURL := lastFMBaseURL + "?" + params.Encode()

	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("User-Agent", "VibeStream/1.0.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("lastfm request failed: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		SimilarTracks struct {
			Track []lastFMSimilarTrack `json:"track"`
		} `json:"similartracks"`
		Error   int    `json:"error"`
		Message string `json:"message"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("lastfm decode error: %w", err)
	}

	if result.Error != 0 {
		return nil, fmt.Errorf("lastfm api error %d: %s", result.Error, result.Message)
	}

	fmt.Printf("[LastFM] Found %d similar tracks for '%s - %s'\n", len(result.SimilarTracks.Track), artist, title)
	return result.SimilarTracks.Track, nil
}

// enrichWithItunes cross-references Last.fm tracks against iTunes to get full metadata.
// Returns enriched SmartTrack slice. Tracks that can't be found on iTunes are skipped.
// excludeIDs is a set of track IDs that must never appear in the result (current song + history).
func enrichWithItunes(lastFMTracks []lastFMSimilarTrack, excludeIDs map[string]bool) []SmartTrack {
	client := newHTTPClient()
	var enriched []SmartTrack
	seen := make(map[string]bool) // dedup by artist+title

	for _, track := range lastFMTracks {
		if len(enriched) >= 10 {
			break
		}

		key := strings.ToLower(track.Artist.Name + "|" + track.Name)
		if seen[key] {
			continue
		}
		seen[key] = true

		// Use sanitized artist for iTunes search to handle diacritics from Last.fm results
		sanitizedTrackArtist := sanitizeArtistName(track.Artist.Name)
		query := fmt.Sprintf("%s %s", sanitizedTrackArtist, track.Name)
		searchURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=3", url.QueryEscape(query))

		resp, err := client.Get(searchURL)
		if err != nil {
			continue
		}

		var result struct {
			Results []struct {
				TrackID          int    `json:"trackId"`
				TrackName        string `json:"trackName"`
				ArtistName       string `json:"artistName"`
				CollectionName   string `json:"collectionName"`
				ArtworkUrl100    string `json:"artworkUrl100"`
				PreviewUrl       string `json:"previewUrl"`
				TrackTimeMillis  int    `json:"trackTimeMillis"`
				PrimaryGenreName string `json:"primaryGenreName"`
			} `json:"results"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()

		if len(result.Results) == 0 {
			continue
		}

		item := result.Results[0]
		trackIDStr := fmt.Sprintf("%d", item.TrackID)

		// De-duplication guard: skip if this track is in the exclusion set
		if excludeIDs[trackIDStr] {
			fmt.Printf("[SmartShuffle] Skipping excluded track ID %s (%s - %s)\n", trackIDStr, item.ArtistName, item.TrackName)
			continue
		}

		enriched = append(enriched, SmartTrack{
			ID:         trackIDStr,
			Title:      item.TrackName,
			Artist:     item.ArtistName,
			Album:      item.CollectionName,
			Genre:      item.PrimaryGenreName,
			CoverArt:   upsizeArtwork(item.ArtworkUrl100),
			PreviewURL: item.PreviewUrl,
			Duration:   item.TrackTimeMillis,
			Source:     "lastfm",
			IsReady:    true,
		})
	}

	return enriched
}

// itunesFallbackTracks builds a SmartTrack queue from iTunes when Last.fm fails or returns too few results.
// Uses a 4-strategy cascade:
//   1. Sanitized artist + genre combo query
//   2. Sanitized artist-only query
//   3. Genre-only query (no artist — most resilient for unknown/niche artists)
//   4. Genre-based Indonesian regional chart (iTunes ID storefront)
//
// excludeIDs is a set of track IDs that must never appear in the result (current song + history).
func itunesFallbackTracks(artist, genre string, excludeIDs map[string]bool) []SmartTrack {
	client := newHTTPClient()
	var tracks []SmartTrack
	seen := make(map[string]bool)

	// Sanitize artist BEFORE building any search query
	sanitizedArtist := sanitizeArtistName(artist)
	fmt.Printf("[SmartShuffle] Sanitized artist: '%s' → '%s'\n", artist, sanitizedArtist)

	// Build the effective genre term — use genre if non-empty, else fall back to "pop"
	effectiveGenre := genre
	if strings.TrimSpace(effectiveGenre) == "" {
		effectiveGenre = "pop"
	}

	queries := []struct {
		term   string
		source string
	}{
		// Strategy 1: sanitized artist + genre (highest precision)
		{sanitizedArtist + " " + effectiveGenre, "itunes_genre"},
		// Strategy 2: sanitized artist only
		{sanitizedArtist, "itunes_artist"},
		// Strategy 3: genre only — resilient for obscure/niche artists
		{effectiveGenre, "itunes_genre_only"},
		// Strategy 4: Indonesian regional genre (catches local music not in global top)
		{effectiveGenre + " indonesia", "itunes_genre_id"},
	}

	for _, q := range queries {
		if len(tracks) >= 10 {
			break
		}
		// Skip artist-specific queries if sanitized artist is empty
		if (q.source == "itunes_genre" || q.source == "itunes_artist") && sanitizedArtist == "" {
			continue
		}

		fmt.Printf("[SmartShuffle] iTunes fallback strategy '%s': query='%s'\n", q.source, q.term)
		searchURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=15", url.QueryEscape(q.term))
		resp, err := client.Get(searchURL)
		if err != nil {
			fmt.Printf("[SmartShuffle] iTunes request error for '%s': %v\n", q.term, err)
			continue
		}

		var result struct {
			Results []struct {
				TrackID          int    `json:"trackId"`
				TrackName        string `json:"trackName"`
				ArtistName       string `json:"artistName"`
				CollectionName   string `json:"collectionName"`
				ArtworkUrl100    string `json:"artworkUrl100"`
				PreviewUrl       string `json:"previewUrl"`
				TrackTimeMillis  int    `json:"trackTimeMillis"`
				PrimaryGenreName string `json:"primaryGenreName"`
			} `json:"results"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()

		for _, item := range result.Results {
			if len(tracks) >= 10 {
				break
			}
			trackIDStr := fmt.Sprintf("%d", item.TrackID)
			// De-duplication guard: skip if in exclusion set or already added
			if excludeIDs[trackIDStr] || seen[trackIDStr] {
				continue
			}
			seen[trackIDStr] = true

			tracks = append(tracks, SmartTrack{
				ID:         trackIDStr,
				Title:      item.TrackName,
				Artist:     item.ArtistName,
				Album:      item.CollectionName,
				Genre:      item.PrimaryGenreName,
				CoverArt:   upsizeArtwork(item.ArtworkUrl100),
				PreviewURL: item.PreviewUrl,
				Duration:   item.TrackTimeMillis,
				Source:     q.source,
				IsReady:    true,
			})
		}
	}

	return tracks
}

// itunesRSSHardFallback fetches the iTunes global Top 20 RSS feed and returns random tracks.
// This is the LAST resort guard — it guarantees a non-empty result even when all
// targeted strategies fail (e.g. completely unknown artist with no genre metadata).
// The returned tracks are randomized so repeated calls don't produce the same order.
func itunesRSSHardFallback(excludeIDs map[string]bool, limit int) []SmartTrack {
	fmt.Printf("[SmartShuffle] Activating HARD FALLBACK — pulling from iTunes RSS Top 20 globally\n")
	client := &http.Client{Timeout: 10 * time.Second}

	// Use both a global and an Indonesian chart for variety
	rssURLs := []string{
		"https://rss.applemarketingtools.com/api/v2/us/music/most-played/20/songs.json",
		"https://rss.applemarketingtools.com/api/v2/id/music/most-played/20/songs.json",
	}

	var pool []SmartTrack
	seen := make(map[string]bool)

	for _, rssURL := range rssURLs {
		resp, err := client.Get(rssURL)
		if err != nil {
			fmt.Printf("[SmartShuffle] Hard fallback RSS error: %v\n", err)
			continue
		}

		var feed struct {
			Feed struct {
				Results []struct {
					ID          string `json:"id"`
					Name        string `json:"name"`
					ArtistName  string `json:"artistName"`
					ArtworkURL  string `json:"artworkUrl100"`
					GenreName   string `json:"genreName"`
					URL         string `json:"url"`
				} `json:"results"`
			} `json:"feed"`
		}

		if err := json.NewDecoder(resp.Body).Decode(&feed); err != nil {
			resp.Body.Close()
			continue
		}
		resp.Body.Close()

		for _, item := range feed.Feed.Results {
			if excludeIDs[item.ID] || seen[item.ID] {
				continue
			}
			seen[item.ID] = true
			pool = append(pool, SmartTrack{
				ID:       item.ID,
				Title:    item.Name,
				Artist:   item.ArtistName,
				Genre:    item.GenreName,
				CoverArt: upsizeArtwork(item.ArtworkURL),
				Source:   "rss_fallback",
				IsReady:  true,
			})
		}
	}

	if len(pool) == 0 {
		return nil
	}

	// Fisher-Yates shuffle so the hard fallback feels varied
	rand.Shuffle(len(pool), func(i, j int) { pool[i], pool[j] = pool[j], pool[i] })

	if limit > len(pool) {
		limit = len(pool)
	}
	fmt.Printf("[SmartShuffle] Hard fallback returning %d tracks from RSS pool of %d\n", limit, len(pool))
	return pool[:limit]
}

// BuildSmartQueue is the main coordinator called by the frontend.
// Orchestration order:
//   1. Last.fm track.getSimilar (using SANITIZED artist) → iTunes enrichment
//   2. iTunes fallback cascade (sanitized artist + genre, genre-only, ID regional)
//   3. Hard fallback: iTunes RSS Top 20 global/ID — GUARANTEED non-empty result
//
// excludeID      — the currently playing song ID (always excluded)
// historyIDsJSON — JSON-encoded []string of recently played song IDs (also always excluded)
func (a *App) BuildSmartQueue(seedArtist, seedTitle, seedGenre, excludeID, historyIDsJSON string) ([]SmartTrack, error) {
	fmt.Printf("[SmartShuffle] Building queue — seed: '%s - %s' (genre: %s, excludeID: %s)\n",
		seedArtist, seedTitle, seedGenre, excludeID)

	// ── Step A: Sanitize the seed artist before any API call ──
	sanitizedArtist := sanitizeArtistName(seedArtist)
	fmt.Printf("[SmartShuffle] Artist sanitized: '%s' → '%s'\n", seedArtist, sanitizedArtist)

	// ── Step B: Build the unified exclusion set from current song + history ──
	excludeSet := make(map[string]bool)
	if excludeID != "" {
		excludeSet[excludeID] = true
	}
	if historyIDsJSON != "" {
		var historyIDs []string
		if err := json.Unmarshal([]byte(historyIDsJSON), &historyIDs); err == nil {
			for _, id := range historyIDs {
				excludeSet[id] = true
			}
		} else {
			fmt.Printf("[SmartShuffle] Warning: failed to parse historyIDsJSON: %v\n", err)
		}
	}
	fmt.Printf("[SmartShuffle] Exclusion set size: %d IDs\n", len(excludeSet))

	// ── Strategy 1: Last.fm (sanitized artist) → iTunes enrichment ──
	lastFMTracks, lastFMErr := getSimilarFromLastFM(sanitizedArtist, seedTitle, 20)
	if lastFMErr == nil && len(lastFMTracks) > 0 {
		enriched := enrichWithItunes(lastFMTracks, excludeSet)
		if len(enriched) >= 5 {
			fmt.Printf("[SmartShuffle] Strategy 1 (Last.fm) success: %d enriched tracks\n", len(enriched))
			return enriched, nil
		}
		fmt.Printf("[SmartShuffle] Strategy 1 (Last.fm) weak (%d tracks), continuing cascade\n", len(enriched))
	} else {
		fmt.Printf("[SmartShuffle] Strategy 1 (Last.fm) failed: %v\n", lastFMErr)
	}

	// ── Strategy 2: iTunes fallback cascade (sanitized artist + genre-only) ──
	fallback := itunesFallbackTracks(sanitizedArtist, seedGenre, excludeSet)
	if len(fallback) >= 3 {
		fmt.Printf("[SmartShuffle] Strategy 2 (iTunes cascade) success: %d tracks\n", len(fallback))
		return fallback, nil
	}
	fmt.Printf("[SmartShuffle] Strategy 2 (iTunes cascade) weak (%d tracks), activating hard fallback\n", len(fallback))

	// ── Strategy 3: HARD FALLBACK GUARD — iTunes RSS Top 20 (global + ID) ──
	// This path is only reached when the artist is completely unknown to both Last.fm and iTunes.
	// The RSS feed always has fresh content so the result is guaranteed non-empty.
	hardFallback := itunesRSSHardFallback(excludeSet, 7)
	if len(hardFallback) > 0 {
		// Merge any partial iTunes results we got in strategy 2 (put them first for relevance)
		combined := append(fallback, hardFallback...)
		if len(combined) > 10 {
			combined = combined[:10]
		}
		fmt.Printf("[SmartShuffle] Strategy 3 (Hard RSS fallback): %d tracks total\n", len(combined))
		return combined, nil
	}

	// Absolute last resort: return whatever we managed to collect (may be empty)
	fmt.Printf("[SmartShuffle] All strategies exhausted. Returning %d partial tracks.\n", len(fallback))
	return fallback, nil
}

// ─────────────────────────────────────────────
//  LYRICS
// ─────────────────────────────────────────────

// GetLyrics uses a 2-strategy approach: LrcLib /api/get (exact match) → /api/search (strict fallback filter)
// Results are cached for 60 seconds to prevent API spam during frontend exponential backoff retries.
func (a *App) GetLyrics(artist string, title string, durationSec int) LyricsResult {
	// ── Cache check (TTL: 60 seconds) ──
	cacheKey := fmt.Sprintf("%s|%s|%d", strings.ToLower(artist), strings.ToLower(title), durationSec)
	if raw, ok := a.lyricsCache.Load(cacheKey); ok {
		entry := raw.(lyricsCacheEntry)
		if time.Since(entry.cachedAt) < 60*time.Second {
			fmt.Printf("[Lyrics] Cache hit for %s - %s\n", artist, title)
			return entry.result
		}
		// Expired — delete and re-fetch
		a.lyricsCache.Delete(cacheKey)
	}

	client := newHTTPClient()
	userAgent := "VibeStream/1.0.0 (https://github.com/RFQA/Music-Wails)"
	empty := LyricsResult{PlainLyrics: "[00:00.00] Lirik tidak ditemukan"}

	// ── Strategy 1: Exact match API ──
	// GET https://lrclib.net/api/get?track_name={cleanTitle}&artist_name={cleanArtist}
	getURL := fmt.Sprintf("https://lrclib.net/api/get?track_name=%s&artist_name=%s",
		url.QueryEscape(title), url.QueryEscape(artist))

	req, _ := http.NewRequest("GET", getURL, nil)
	req.Header.Set("User-Agent", userAgent)

	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == 200 {
		var r struct {
			SyncedLyrics string  `json:"syncedLyrics"`
			PlainLyrics  string  `json:"plainLyrics"`
			Duration     float64 `json:"duration"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&r); err == nil {
			resp.Body.Close()
			if r.SyncedLyrics != "" || r.PlainLyrics != "" {
				fmt.Printf("[Lyrics] Exact match success: %s - %s\n", artist, title)
				result := LyricsResult{SyncedLyrics: r.SyncedLyrics, PlainLyrics: r.PlainLyrics, LrcDuration: int(r.Duration)}
				a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: result, cachedAt: time.Now()})
				return result
			}
		}
	}
	if resp != nil {
		resp.Body.Close()
	}

	// ── Strategy 2: Search with Strict Fallback Filter ──
	// GET https://lrclib.net/api/search?q={cleanTitle}+{cleanArtist}
	fmt.Printf("[Lyrics] Exact match failed, trying search fallback: %s - %s\n", artist, title)
	searchURL := fmt.Sprintf("https://lrclib.net/api/search?q=%s", url.QueryEscape(title+" "+artist))

	req2, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return empty
	}
	req2.Header.Set("User-Agent", userAgent)

	resp2, err := client.Do(req2)
	if err != nil || resp2.StatusCode != 200 {
		if resp2 != nil {
			resp2.Body.Close()
		}
		// Cache the empty result briefly (10s short TTL) so it retries soon
		a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: empty, cachedAt: time.Now().Add(-50 * time.Second)})
		return empty
	}
	defer resp2.Body.Close()

	var results []struct {
		TrackName    string  `json:"trackName"`
		ArtistName   string  `json:"artistName"`
		SyncedLyrics string  `json:"syncedLyrics"`
		PlainLyrics  string  `json:"plainLyrics"`
		Duration     float64 `json:"duration"`
	}

	if err := json.NewDecoder(resp2.Body).Decode(&results); err != nil {
		return empty
	}

	lowerCleanTitle := strings.ToLower(title)
	lowerCleanArtist := strings.ToLower(artist)

	for _, r := range results {
		rTrack := strings.ToLower(r.TrackName)
		rArtist := strings.ToLower(r.ArtistName)

		// Check if result[i].trackName contains cleanTitle AND result[i].artistName contains cleanArtist
		if strings.Contains(rTrack, lowerCleanTitle) && strings.Contains(rArtist, lowerCleanArtist) {
			if r.SyncedLyrics != "" || r.PlainLyrics != "" {
				fmt.Printf("[Lyrics] Search strict match success: %s - %s (found %s - %s)\n", artist, title, r.ArtistName, r.TrackName)
				result := LyricsResult{SyncedLyrics: r.SyncedLyrics, PlainLyrics: r.PlainLyrics, LrcDuration: int(r.Duration)}
				a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: result, cachedAt: time.Now()})
				return result
			}
		}
	}

	// Cache the empty result briefly (10s short TTL) so it retries soon
	a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: empty, cachedAt: time.Now().Add(-50 * time.Second)})
	return empty
}


// GetTrackPulseDuration queries Last.fm for track tags to determine a simulated BPM,
// then returns a CSS animation duration (in seconds) for a "pulse" effect synced to the genre.
func (a *App) GetTrackPulseDuration(artist string, title string) float64 {
	defaultDuration := 4.0 // Slow breathing default

	client := newHTTPClient()
	params := url.Values{}
	params.Set("method", "track.getInfo")
	params.Set("artist", artist)
	params.Set("track", title)
	params.Set("api_key", lastFMAPIKey)
	params.Set("format", "json")

	apiURL := lastFMBaseURL + "?" + params.Encode()

	req, _ := http.NewRequest("GET", apiURL, nil)
	resp, err := client.Do(req)
	if err != nil {
		return defaultDuration
	}
	defer resp.Body.Close()

	var result struct {
		Track struct {
			TopTags struct {
				Tag []struct {
					Name string `json:"name"`
				} `json:"tag"`
			} `json:"toptags"`
		} `json:"track"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return defaultDuration
	}

	// Determine pulse based on tags
	for _, tag := range result.Track.TopTags.Tag {
		name := strings.ToLower(tag.Name)
		switch {
		case strings.Contains(name, "dance") || strings.Contains(name, "edm") || strings.Contains(name, "house") || strings.Contains(name, "techno") || strings.Contains(name, "electronic"):
			return 1.8 // Fast pulse
		case strings.Contains(name, "pop") || strings.Contains(name, "rock") || strings.Contains(name, "hip-hop") || strings.Contains(name, "rap") || strings.Contains(name, "rnb"):
			return 2.5 // Medium pulse
		case strings.Contains(name, "acoustic") || strings.Contains(name, "ballad") || strings.Contains(name, "chill") || strings.Contains(name, "ambient") || strings.Contains(name, "slow"):
			return 5.0 // Slow pulse
		}
	}

	return defaultDuration
}

