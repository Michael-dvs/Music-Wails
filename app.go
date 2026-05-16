package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

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
	ctx          context.Context
	lyricsCache  sync.Map // map[string]lyricsCacheEntry — TTL 60s
	sbURL        string   // Supabase project URL
	sbAnonKey        string   // publishable key (for user-scoped requests)
	sbServiceKey     string   // secret key (for admin operations)
	currentUserToken string   // currently active user session token
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


const oauthCallbackPort = 54321

// oauthResult carries tokens (or an error) from the local HTTP callback
type oauthResult struct {
	AccessToken  string
	RefreshToken string
	Error        string
}

// StartGoogleLogin opens the system browser for Google OAuth and
// starts a temporary local server to capture the Supabase callback.
// This is non-blocking — the result arrives via Wails event "auth:google:success".
func (a *App) StartGoogleLogin() error {
	if a.sbURL == "" || a.sbURL == "YOUR_SUPABASE" {
		return fmt.Errorf("SUPABASE_URL not configured — edit .env dan restart")
	}

	redirectTo := fmt.Sprintf("http://localhost:%d/callback", oauthCallbackPort)

	authURL := fmt.Sprintf(
		"%s/auth/v1/authorize?provider=google&redirect_to=%s",
		a.sbURL,
		url.QueryEscape(redirectTo),
	)

	// Start the local callback server
	resultCh, stopServer := a.startOAuthCallbackServer()

	// Open system browser (Chrome, Edge, Firefox — whatever the OS default is)
	runtime.BrowserOpenURL(a.ctx, authURL)

	// Wait for callback asynchronously — don't block the UI
	go func() {
		select {
		case res := <-resultCh:
			stopServer() // shut down the HTTP server
			if res.Error != "" {
				runtime.EventsEmit(a.ctx, "auth:google:error", res.Error)
				return
			}
			// Success — save token to Go backend instance and emit event
			a.currentUserToken = res.AccessToken
			runtime.EventsEmit(a.ctx, "login-success", map[string]string{
				"access_token":  res.AccessToken,
				"refresh_token": res.RefreshToken,
			})

		case <-time.After(10 * time.Minute):
			stopServer()
			runtime.EventsEmit(a.ctx, "auth:google:error", "Login timeout setelah 10 menit.")
		}
	}()

	return nil
}

// startOAuthCallbackServer starts a local HTTP server on :54321.
// Returns a channel that delivers the result and a stop function.
func (a *App) startOAuthCallbackServer() (<-chan oauthResult, func()) {
	resultCh := make(chan oauthResult, 1)

	// ── Callback page: returns HTML that reads the URL fragment via JS ──
	callbackHTML := fmt.Sprintf(`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Music-Wails — Autentikasi</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-color: #0c0c0c;
      --card-bg: #1c1c1e;
      --text-main: #f5f5f7;
      --text-muted: #8e8e93;
      --accent: #FA243C; /* Apple Music Red */
      --success: #34c759;
    }
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
      background-color: var(--bg-color);
      color: var(--text-main);
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      overflow: hidden;
    }

    .card {
      background: var(--card-bg);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 24px;
      padding: 40px 32px;
      width: 100%;
      max-width: 360px;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
      animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }

    .icon-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 64px;
      margin-bottom: 24px;
    }

    /* Ikon SVG Styles */
    svg { width: 48px; height: 48px; }
    
    .spinner {
      stroke: var(--text-muted);
      animation: spin 1s linear infinite;
    }
    
    .success-icon {
      stroke: var(--success);
      animation: scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      display: none;
    }
    
    .error-icon {
      stroke: var(--accent);
      animation: scaleIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      display: none;
    }

    h2 {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
    }

    p {
      color: var(--text-muted);
      font-size: 14px;
      line-height: 1.5;
    }

    /* Keyframes */
    @keyframes spin { 100% { transform: rotate(360deg); } }
    @keyframes slideUp {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes scaleIn {
      0% { opacity: 0; transform: scale(0.5); }
      100% { opacity: 1; transform: scale(1); }
    }
  </style>
</head>
<body>

  <div class="card">
    <div class="icon-container" id="icon-wrapper">
      <svg class="spinner" id="icon-loading" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <svg class="success-icon" id="icon-success" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
        <polyline points="22 4 12 14.01 9 11.01"></polyline>
      </svg>
      <svg class="error-icon" id="icon-error" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="15" y1="9" x2="9" y2="15"></line>
        <line x1="9" y1="9" x2="15" y2="15"></line>
      </svg>
    </div>
    
    <h2 id="title">Mengautentikasi...</h2>
    <p id="msg">Menghubungkan dengan aman ke akun Google Anda.</p>
  </div>

  <script>
  (function() {
    var hashParams  = new URLSearchParams(window.location.hash.slice(1));
    var queryParams = new URLSearchParams(window.location.search);

    var accessToken  = hashParams.get('access_token')  || queryParams.get('access_token');
    var refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token') || '';
    var code         = queryParams.get('code');
    var err          = hashParams.get('error_description') || hashParams.get('error') ||
                       queryParams.get('error_description') || queryParams.get('error');

    function hideAllIcons() {
      document.getElementById('icon-loading').style.display = 'none';
      document.getElementById('icon-success').style.display = 'none';
      document.getElementById('icon-error').style.display = 'none';
    }

    function showSuccess() {
      hideAllIcons();
      document.getElementById('icon-success').style.display = 'block';
      document.getElementById('title').textContent = 'Autentikasi Berhasil';
      document.getElementById('msg').textContent   = 'Anda sudah bisa kembali ke aplikasi. Tab ini akan tertutup otomatis.';
      setTimeout(function() { window.close(); }, 3000);
    }

    function showError(msg) {
      hideAllIcons();
      document.getElementById('icon-error').style.display = 'block';
      document.getElementById('title').textContent = 'Autentikasi Gagal';
      document.getElementById('msg').textContent   = msg;
    }

    if (accessToken) {
      fetch('http://localhost:%d/token', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({access_token: accessToken, refresh_token: refreshToken})
      }).then(showSuccess).catch(function(){ showSuccess(); });

    } else if (code) {
      fetch('http://localhost:%d/code', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({code: code})
      }).then(showSuccess).catch(function(){ showSuccess(); });

    } else if (err) {
      showError(err);
      fetch('http://localhost:%d/error', {
        method:  'POST',
        headers: {'Content-Type':'application/json'},
        body:    JSON.stringify({error: err})
      }).catch(function(){});

    } else {
      showError('Sesi tidak valid atau tidak ada data login. Silakan coba lagi.');
    }
  })();
  </script>
</body>
</html>`, oauthCallbackPort, oauthCallbackPort, oauthCallbackPort)

	mux := http.NewServeMux()

	mux.HandleFunc("/callback", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, callbackHTML)
	})

	// /token — receives { access_token, refresh_token } from the HTML page JS
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}
		var payload struct {
			AccessToken  string `json:"access_token"`
			RefreshToken string `json:"refresh_token"`
		}
		json.NewDecoder(r.Body).Decode(&payload)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		// Non-blocking send — ignore if already sent
		select {
		case resultCh <- oauthResult{AccessToken: payload.AccessToken, RefreshToken: payload.RefreshToken}:
		default:
		}
	})

	// /code — receives { code } for PKCE flow; exchanges it for tokens
	mux.HandleFunc("/code", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}
		var payload struct{ Code string `json:"code"` }
		json.NewDecoder(r.Body).Decode(&payload)

		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)

		// Exchange code → tokens via Supabase REST
		go func() {
			body := map[string]interface{}{
				"auth_code":    payload.Code,
				"redirect_uri": fmt.Sprintf("http://localhost:%d/callback", oauthCallbackPort),
			}
			resp, err := a.sbRequest("POST", "/auth/v1/token?grant_type=pkce", "", body)
			if err != nil {
				select {
				case resultCh <- oauthResult{Error: err.Error()}:
				default:
				}
				return
			}
			defer resp.Body.Close()
			var session struct {
				AccessToken  string `json:"access_token"`
				RefreshToken string `json:"refresh_token"`
				Error        string `json:"error_description"`
			}
			json.NewDecoder(resp.Body).Decode(&session)
			if session.Error != "" {
				select {
				case resultCh <- oauthResult{Error: session.Error}:
				default:
				}
				return
			}
			select {
			case resultCh <- oauthResult{AccessToken: session.AccessToken, RefreshToken: session.RefreshToken}:
			default:
			}
		}()
	})

	// /error — receives error from the HTML page JS
	mux.HandleFunc("/error", func(w http.ResponseWriter, r *http.Request) {
		var payload struct{ Error string `json:"error"` }
		json.NewDecoder(r.Body).Decode(&payload)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		select {
		case resultCh <- oauthResult{Error: payload.Error}:
		default:
		}
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", oauthCallbackPort),
		Handler: mux,
	}
	go func() { _ = srv.ListenAndServe() }()

	stop := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_ = srv.Shutdown(ctx)
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

// GetFullStreamURL — searches YouTube (Official API v3) then extracts stream via kkdai
// Returns ("", error) on failure so frontend can fall back to iTunes preview
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
		fmt.Printf("[YouTube] kkdai error: %v\n", err)
		return "", err
	}

	formats := video.Formats.WithAudioChannels()
	if len(formats) == 0 {
		return "", fmt.Errorf("no audio formats for video %s", videoID)
	}
	formats.Sort()

	streamURL, err := ytClient.GetStreamURL(video, &formats[0])
	if err != nil {
		fmt.Printf("[YouTube] GetStreamURL error: %v\n", err)
		return "", err
	}

	return streamURL, nil
}

// ─────────────────────────────────────────────
//  SMART SHUFFLE — LAST.FM DISCOVERY
// ─────────────────────────────────────────────

// lastFMSimilarTrack is the raw shape returned by Last.fm track.getSimilar
type lastFMSimilarTrack struct {
	Name   string `json:"name"`
	Artist struct {
		Name string `json:"name"`
	} `json:"artist"`
	Match float64 `json:"match"`
}

// getSimilarFromLastFM calls Last.fm track.getSimilar and returns raw track pairs
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
func enrichWithItunes(lastFMTracks []lastFMSimilarTrack, excludeID string) []SmartTrack {
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

		query := fmt.Sprintf("%s %s", track.Artist.Name, track.Name)
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

		if trackIDStr == excludeID {
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

// itunesFallbackTracks builds a SmartTrack queue from iTunes directly (no Last.fm)
func itunesFallbackTracks(artist, genre, excludeID string) []SmartTrack {
	client := newHTTPClient()
	var tracks []SmartTrack
	seen := make(map[string]bool)

	queries := []struct {
		term   string
		source string
	}{
		{genre + " " + artist, "itunes_genre"},
		{artist, "itunes_artist"},
	}

	for _, q := range queries {
		if len(tracks) >= 10 {
			break
		}

		searchURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=song&limit=15", url.QueryEscape(q.term))
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

		for _, item := range result.Results {
			if len(tracks) >= 10 {
				break
			}

			trackIDStr := fmt.Sprintf("%d", item.TrackID)
			if trackIDStr == excludeID || seen[trackIDStr] {
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

// BuildSmartQueue is the main coordinator called by the frontend.
// It orchestrates: Last.fm → iTunes enrichment → iTunes fallback
// Returns up to 10 SmartTracks with full metadata (YouTube is lazy-loaded by frontend).
func (a *App) BuildSmartQueue(seedArtist, seedTitle, seedGenre, excludeID string) ([]SmartTrack, error) {
	fmt.Printf("[SmartShuffle] Building queue — seed: '%s - %s' (genre: %s)\n", seedArtist, seedTitle, seedGenre)

	// --- Strategy 1: Last.fm track.getSimilar → iTunes enrichment ---
	lastFMTracks, err := getSimilarFromLastFM(seedArtist, seedTitle, 15)
	if err == nil && len(lastFMTracks) > 0 {
		enriched := enrichWithItunes(lastFMTracks, excludeID)
		if len(enriched) >= 5 {
			fmt.Printf("[SmartShuffle] Last.fm path: %d enriched tracks\n", len(enriched))
			return enriched, nil
		}
		fmt.Printf("[SmartShuffle] Last.fm enrichment yielded only %d tracks, trying fallback\n", len(enriched))
	} else {
		fmt.Printf("[SmartShuffle] Last.fm failed (%v), using iTunes fallback\n", err)
	}

	// --- Strategy 2: iTunes genre/artist fallback ---
	fallback := itunesFallbackTracks(seedArtist, seedGenre, excludeID)
	fmt.Printf("[SmartShuffle] iTunes fallback: %d tracks\n", len(fallback))
	return fallback, nil
}

// ─────────────────────────────────────────────
//  LYRICS
// ─────────────────────────────────────────────

// GetLyrics uses a 2-strategy approach: LrcLib /api/get (with duration) → /api/search
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
	empty := LyricsResult{}

	// ── Strategy 1: Strict match with duration ──
	getURL := fmt.Sprintf("https://lrclib.net/api/get?artist_name=%s&track_name=%s&duration=%d",
		url.QueryEscape(artist), url.QueryEscape(title), durationSec)

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
			if r.SyncedLyrics != "" {
				fmt.Printf("[Lyrics] Smart match success: %s - %s\n", artist, title)
				result := LyricsResult{SyncedLyrics: r.SyncedLyrics, PlainLyrics: r.PlainLyrics, LrcDuration: int(r.Duration)}
				a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: result, cachedAt: time.Now()})
				return result
			}
		}
	}
	if resp != nil {
		resp.Body.Close()
	}

	// ── Strategy 2: Fuzzy search fallback ──
	fmt.Printf("[Lyrics] Smart match failed, falling back to search: %s - %s\n", artist, title)
	searchURL := fmt.Sprintf("https://lrclib.net/api/search?q=%s", url.QueryEscape(artist+" "+title))

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
		// Cache the empty result for 10s to avoid hammering on a bad song
		a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: empty, cachedAt: time.Now().Add(-50 * time.Second)})
		return empty
	}
	defer resp2.Body.Close()

	var results []struct {
		SyncedLyrics string  `json:"syncedLyrics"`
		PlainLyrics  string  `json:"plainLyrics"`
		Duration     float64 `json:"duration"`
	}

	if err := json.NewDecoder(resp2.Body).Decode(&results); err != nil {
		return empty
	}

	for _, r := range results {
		if r.SyncedLyrics != "" {
			result := LyricsResult{SyncedLyrics: r.SyncedLyrics, PlainLyrics: r.PlainLyrics, LrcDuration: int(r.Duration)}
			a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: result, cachedAt: time.Now()})
			return result
		}
	}
	if len(results) > 0 && results[0].PlainLyrics != "" {
		result := LyricsResult{PlainLyrics: results[0].PlainLyrics, LrcDuration: int(results[0].Duration)}
		a.lyricsCache.Store(cacheKey, lyricsCacheEntry{result: result, cachedAt: time.Now()})
		return result
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

