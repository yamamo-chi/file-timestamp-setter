package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
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

// FileInfo defines the file path and its last modified time
type FileInfo struct {
	Path         string `json:"path"`
	ModifiedTime int64  `json:"modifiedTime"` // Unix timestamp in seconds
}

// FileTimestamp defines a pair of file path and the target timestamp
type FileTimestamp struct {
	Path      string `json:"path"`
	Timestamp int64  `json:"timestamp"` // Unix timestamp in seconds
}

// SelectFiles opens a file dialog to let the user select multiple files
func (a *App) SelectFiles() ([]string, error) {
	files, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "ファイルを選択",
	})
	if err != nil {
		return nil, err
	}
	return files, nil
}

// GetFilesInfo retrieves the paths and modified times for a list of files
func (a *App) GetFilesInfo(files []string) ([]FileInfo, error) {
	var result []FileInfo

	for _, filePath := range files {
		info, err := os.Stat(filePath)
		if err != nil {
			return nil, fmt.Errorf("failed to get metadata for %s: %w", filePath, err)
		}

		result = append(result, FileInfo{
			Path:         filePath,
			ModifiedTime: info.ModTime().Unix(),
		})
	}

	return result, nil
}

// SetIndividualFileTimes sets the modification times for multiple files individually
func (a *App) SetIndividualFileTimes(fileTimestamps []FileTimestamp) error {
	for _, item := range fileTimestamps {
		mtime := time.Unix(item.Timestamp, 0)
		err := setFileMtime(item.Path, mtime)
		if err != nil {
			return fmt.Errorf("failed to set time for %s: %w", item.Path, err)
		}
	}
	return nil
}

// GetImageData reads an image file and returns it as a Base64-encoded Data URL
func (a *App) GetImageData(filePath string) (string, error) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to read file: %w", err)
	}

	ext := strings.ToLower(filepath.Ext(filePath))
	mimeType := "application/octet-stream"
	switch ext {
	case ".jpg", ".jpeg":
		mimeType = "image/jpeg"
	case ".png":
		mimeType = "image/png"
	case ".gif":
		mimeType = "image/gif"
	case ".bmp":
		mimeType = "image/bmp"
	case ".webp":
		mimeType = "image/webp"
	case ".svg":
		mimeType = "image/svg+xml"
	case ".ico":
		mimeType = "image/x-icon"
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:%s;base64,%s", mimeType, encoded), nil
}

// Helper function to get access and modification times of a file
func getFileTimes(path string) (atime, mtime time.Time, err error) {
	info, err := os.Stat(path)
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	mtime = info.ModTime()

	// On Windows, retrieve the LastAccessTime from Win32FileAttributeData
	if d, ok := info.Sys().(*syscall.Win32FileAttributeData); ok {
		atime = time.Unix(0, d.LastAccessTime.Nanoseconds())
	} else {
		atime = mtime
	}
	return atime, mtime, nil
}

// Helper function to set modification time without changing access time if possible
func setFileMtime(path string, mtime time.Time) error {
	atime, _, err := getFileTimes(path)
	if err != nil {
		// Fallback to setting atime to mtime if stat fails
		atime = mtime
	}
	return os.Chtimes(path, atime, mtime)
}
