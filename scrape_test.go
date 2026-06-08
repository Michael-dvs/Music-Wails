package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
)

func main() {
	url := "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	defer resp.Body.Close()
	
	body, _ := io.ReadAll(resp.Body)
	err = os.WriteFile("spotify_dump.html", body, 0644)
	if err != nil {
		fmt.Println("Error writing file:", err)
		return
	}
	fmt.Println("Dumped to spotify_dump.html")
}
