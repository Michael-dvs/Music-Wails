package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/kkdai/youtube/v2"
	google_youtube "google.golang.org/api/youtube/v3"
	"google.golang.org/api/option"
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
	ctx         context.Context
	lyricsCache sync.Map // map[string]lyricsCacheEntry — TTL 60s
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
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
func (a *App) GetFullStreamURL(artist string, title string) (string, error) {
	query := fmt.Sprintf("%s %s audio", artist, title)

	// Step 1: Search via Official YouTube Data API v3
	ytService, err := google_youtube.NewService(context.Background(), option.WithAPIKey(youtubeAPIKey))
	if err != nil {
		fmt.Printf("[YouTube] Failed to create service: %v\n", err)
		return "", err
	}

	call := ytService.Search.List([]string{"id"}).
		Q(query).
		Type("video").
		MaxResults(1)

	response, err := call.Do()
	if err != nil {
		fmt.Printf("[YouTube] Search error: %v\n", err)
		return "", err
	}

	if len(response.Items) == 0 {
		return "", fmt.Errorf("no video found for: %s", query)
	}

	videoID := response.Items[0].Id.VideoId
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

