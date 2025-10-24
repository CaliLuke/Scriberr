package web

import (
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"path"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func setupStaticRouter(t *testing.T) *gin.Engine {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.Use(gin.Recovery())
	SetupStaticRoutes(router)
	return router
}

func findAssetByExt(t *testing.T, ext string) string {
	t.Helper()
	pattern := "dist/assets/*." + ext
	matches, err := fs.Glob(staticFiles, pattern)
	if err != nil {
		t.Fatalf("failed to glob assets for %s: %v", ext, err)
	}
	if len(matches) == 0 {
		t.Fatalf("no asset with extension %s found in embedded dist", ext)
	}
	return path.Base(matches[0])
}

func TestAssetsHandlerServesHashedAssets(t *testing.T) {
	router := setupStaticRouter(t)
	testCases := []struct {
		ext        string
		wantSubstr string
	}{
		{ext: "css", wantSubstr: "text/css"},
		{ext: "js", wantSubstr: "javascript"},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.ext, func(t *testing.T) {
			asset := findAssetByExt(t, tc.ext)
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, "/assets/"+asset, nil)
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", rec.Code)
			}

			contentType := rec.Header().Get("Content-Type")
			if !strings.Contains(contentType, tc.wantSubstr) {
				t.Fatalf("expected content type containing %q, got %q", tc.wantSubstr, contentType)
			}

			cacheControl := rec.Header().Get("Cache-Control")
			if cacheControl != "public, max-age=31536000, immutable" {
				t.Fatalf("expected immutable cache control, got %q", cacheControl)
			}
		})
	}
}

func TestAssetsHandlerUnknownFile(t *testing.T) {
	router := setupStaticRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/assets/does-not-exist.txt", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unknown asset, got %d", rec.Code)
	}
}

func TestAssetsHandlerBlocksTraversal(t *testing.T) {
	router := setupStaticRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/assets/../index.html", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for traversal attempt, got %d", rec.Code)
	}
}

func TestTopLevelStaticFiles(t *testing.T) {
	router := setupStaticRouter(t)
	tests := []struct {
		path     string
		wantType string
	}{
		{path: "/vite.svg", wantType: "image/svg+xml"},
		{path: "/scriberr-logo.png", wantType: "image/png"},
		{path: "/scriberr-thumb.png", wantType: "image/png"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodGet, tt.path, nil)
			router.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected status 200, got %d", rec.Code)
			}

			contentType := rec.Header().Get("Content-Type")
			if !strings.Contains(contentType, tt.wantType) {
				t.Fatalf("expected content type containing %q, got %q", tt.wantType, contentType)
			}

			cacheControl := rec.Header().Get("Cache-Control")
			if cacheControl != "public, max-age=86400" {
				t.Fatalf("expected top-level cache control, got %q", cacheControl)
			}
		})
	}
}

func TestSpaFallbackServesIndex(t *testing.T) {
	router := setupStaticRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/non-existent", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for SPA fallback, got %d", rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected text/html content type, got %q", contentType)
	}

	cacheControl := rec.Header().Get("Cache-Control")
	if cacheControl != "no-cache" {
		t.Fatalf("expected index cache control to be no-cache, got %q", cacheControl)
	}

	if !strings.Contains(strings.ToLower(rec.Body.String()), "<!doctype html") {
		t.Fatalf("expected HTML body, got %q", rec.Body.String())
	}
}

func TestSpaFallbackHead(t *testing.T) {
	router := setupStaticRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodHead, "/head-test", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200 for HEAD fallback, got %d", rec.Code)
	}

	contentType := rec.Header().Get("Content-Type")
	if !strings.Contains(contentType, "text/html") {
		t.Fatalf("expected text/html content type, got %q", contentType)
	}

	cacheControl := rec.Header().Get("Cache-Control")
	if cacheControl != "no-cache" {
		t.Fatalf("expected index cache control to be no-cache, got %q", cacheControl)
	}
}

func TestNoRouteRejectsNonIdempotentMethods(t *testing.T) {
	router := setupStaticRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/post-only", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for POST fallback, got %d", rec.Code)
	}
}

func TestApiFallbackUnaffected(t *testing.T) {
	router := setupStaticRouter(t)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/unknown", nil)
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for API fallback, got %d", rec.Code)
	}

	var payload map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("expected JSON error payload, got: %v", err)
	}

	if payload["error"] != "API endpoint not found" {
		t.Fatalf("unexpected error payload: %+v", payload)
	}
}
