package main

import (
	"bufio"
	"embed"
	"os"
	"path/filepath"
	"strings"

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

func main() {
	// Load embedded .env before creating the app so credentials are available
	loadDotEnv()

	// Create an instance of the app structure
	app := NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Music-Wails",
		Width:     1024,
		Height:    768,
		MinWidth:  800,
		MinHeight: 560,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 12, G: 12, B: 12, A: 255},
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
			TitleBar:             mac.TitleBarHiddenInset(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
