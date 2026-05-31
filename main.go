package main

import (
	"bufio"
	"embed"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/mac"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

//go:embed .env
var envContent string

// parseEnvString parses env-formatted lines and sets environment variables.
// Handles both KEY=value and KEY="value" / KEY='value' formats.
func parseEnvString(content string) {
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])
		// Strip surrounding quotes: KEY="value" or KEY='value' → value
		if len(val) >= 2 {
			if (val[0] == '"' && val[len(val)-1] == '"') ||
				(val[0] == '\'' && val[len(val)-1] == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		os.Setenv(key, val)
	}
}

// loadDotEnv reads the embedded .env content and sets each KEY=VALUE as an os environment variable.
// It also checks for a local .env next to the executable or in the working directory for production overrides.
func loadDotEnv() {
	// 1. Load embedded .env (compile-time fallback)
	parseEnvString(envContent)

	// 2. Load from current working directory if available
	if content, err := os.ReadFile(".env"); err == nil {
		parseEnvString(string(content))
	}

	// 3. Load from next to the executable (production runtime override)
	if exePath, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exePath)
		localEnvPath := filepath.Join(exeDir, ".env")
		if content, err := os.ReadFile(localEnvPath); err == nil {
			parseEnvString(string(content))
		}
	}
}

// cspMiddleware injects a Content-Security-Policy header that permits:
//   - media-src: localhost proxy + blob: URLs (YouTube stream goes through local proxy)
//   - connect-src: all external APIs the app uses
//
// Without this, WebView2 blocks cross-origin media streams with MEDIA_ERR_SRC_NOT_SUPPORTED.
type cspMiddleware struct {
	next http.Handler
}

func (m *cspMiddleware) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Security-Policy",
		"default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:;"+
			" media-src * blob: data: http://localhost:54322;"+
			" connect-src * wss: blob: data:;"+
			" img-src * data: blob:;"+
			" font-src * data:;",
	)
	m.next.ServeHTTP(w, r)
}

// ─────────────────────────────────────────────
//
//	LOCAL AUDIO PROXY SERVER (port 54322)
//
// ─────────────────────────────────────────────
// audioProxyStore holds the most recent stream URL mapped to a short token.
// Frontend sets audio.src = http://localhost:54322/stream?t=TOKEN
// Go proxy fetches from YouTube CDN with proper headers and streams to WebView2.
var audioProxyStore sync.Map // map[string]string: token → rawYouTubeURL

// startAudioProxyServer starts a local HTTP server on :54322 that proxies YouTube CDN streams.
// This is necessary because WebView2 cannot directly play googlevideo.com URLs due to
// CORS restrictions — Go acts as a middleman providing correct headers and range support.
func startAudioProxyServer() {
	mux := http.NewServeMux()

	mux.HandleFunc("/stream", func(w http.ResponseWriter, r *http.Request) {
		token := r.URL.Query().Get("t")
		if token == "" {
			http.Error(w, "missing token", http.StatusBadRequest)
			return
		}

		rawURL, ok := audioProxyStore.Load(token)
		if !ok {
			http.Error(w, "token not found or expired", http.StatusNotFound)
			return
		}

		youtubeURL := rawURL.(string)
		fmt.Printf("[AudioProxy] Proxying stream for token %s...\n", token[:min(8, len(token))])

		// Build upstream request with headers YouTube CDN expects
		upstreamReq, err := http.NewRequest("GET", youtubeURL, nil)
		if err != nil {
			http.Error(w, "bad upstream URL", http.StatusInternalServerError)
			return
		}

		// Forward Range header for seeking support
		if rangeHeader := r.Header.Get("Range"); rangeHeader != "" {
			upstreamReq.Header.Set("Range", rangeHeader)
		}

		// Use a browser-like User-Agent so YouTube CDN accepts the request
		upstreamReq.Header.Set("User-Agent",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "+
				"(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
		upstreamReq.Header.Set("Accept", "*/*")
		upstreamReq.Header.Set("Accept-Language", "en-US,en;q=0.9")
		upstreamReq.Header.Set("Origin", "https://www.youtube.com")
		upstreamReq.Header.Set("Referer", "https://www.youtube.com/")

		client := &http.Client{}
		resp, err := client.Do(upstreamReq)
		if err != nil {
			fmt.Printf("[AudioProxy] Upstream error: %v\n", err)
			http.Error(w, "upstream error", http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()

		// Forward important response headers to the browser
		for _, h := range []string{
			"Content-Type", "Content-Length", "Content-Range",
			"Accept-Ranges", "Cache-Control",
		} {
			if v := resp.Header.Get(h); v != "" {
				w.Header().Set(h, v)
			}
		}
		// Always allow WebView2 to use this response
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(resp.StatusCode)

		copied, err := io.Copy(w, resp.Body)
		if err != nil {
			fmt.Printf("[AudioProxy] Stream copy interrupted after %d bytes: %v\n", copied, err)
		} else {
			fmt.Printf("[AudioProxy] Stream complete: %d bytes delivered\n", copied)
		}
	})

	srv := &http.Server{Addr: ":54322", Handler: mux}
	go func() {
		fmt.Println("[AudioProxy] Local proxy listening on http://localhost:54322")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("[AudioProxy] Server error: %v\n", err)
		}
	}()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func main() {
	// Load embedded .env before creating the app so credentials are available
	loadDotEnv()

	// Start local audio proxy so WebView2 can play YouTube streams without CORS issues
	startAudioProxyServer()

	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:  "Music-Wails",
		Width:  1024,
		Height: 768,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Middleware: func(next http.Handler) http.Handler { return &cspMiddleware{next} },
		},
		BackgroundColour: &options.RGBA{R: 12, G: 12, B: 12, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			BackdropType:         windows.Mica,
		},
		Mac: &mac.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
