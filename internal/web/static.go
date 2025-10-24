package web

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"scriberr/pkg/logger"
)

//go:embed dist/*
var staticFiles embed.FS

const (
	distDir           = "dist"
	assetsSubdir      = "assets"
	assetsPrefix      = "/assets"
	cacheAssets       = "public, max-age=31536000, immutable"
	cacheTopLevel     = "public, max-age=86400"
	cacheIndex        = "no-cache"
	indexHTMLFilename = "index.html"
	viteSVGFilename   = "vite.svg"
	logoFilename      = "scriberr-logo.png"
	thumbFilename     = "scriberr-thumb.png"
)

func mustSubDist(subdir string) fs.FS {
	fsys, err := fs.Sub(staticFiles, path.Join(distDir, subdir))
	if err != nil {
		panic("failed to get dist subdirectory: " + err.Error())
	}
	return fsys
}

// GetAssetsHandler returns a handler for serving embedded assets
func GetAssetsHandler() http.Handler {
	return http.FileServer(http.FS(mustSubDist(assetsSubdir)))
}

// GetIndexHTML returns the index.html content
func GetIndexHTML() ([]byte, error) {
	return staticFiles.ReadFile(path.Join(distDir, indexHTMLFilename))
}

func serveEmbeddedFile(c *gin.Context, relPath, cacheControl, contentTypeOverride string) bool {
	data, err := staticFiles.ReadFile(path.Join(distDir, relPath))
	if err != nil {
		logger.Get().Error("failed to read embedded file", logger.String("request_path", c.Request.URL.Path), logger.String("embedded_path", relPath), logger.ErrorField(err))
		return false
	}

	contentType := contentTypeOverride
	if contentType == "" {
		contentType = mime.TypeByExtension(filepath.Ext(relPath))
		if contentType == "" {
			contentType = "application/octet-stream"
		}
	}

	c.Header("Content-Type", contentType)
	if cacheControl != "" {
		c.Header("Cache-Control", cacheControl)
	}

	if c.Request.Method == http.MethodHead {
		c.Status(http.StatusOK)
		return true
	}

	c.Data(http.StatusOK, contentType, data)
	return true
}

// SetupStaticRoutes configures static file serving in Gin
func SetupStaticRoutes(router *gin.Engine) {
	assetsHandler := http.StripPrefix(assetsPrefix, GetAssetsHandler())
	serveAsset := func(c *gin.Context) {
		if strings.Contains(c.Param("filepath"), "..") {
			c.Status(http.StatusNotFound)
			return
		}

		c.Header("Cache-Control", cacheAssets)
		assetsHandler.ServeHTTP(c.Writer, c.Request)
	}

	router.GET(path.Join(assetsPrefix, "*filepath"), serveAsset)
	router.HEAD(path.Join(assetsPrefix, "*filepath"), serveAsset)

	serveTopLevel := func(relPath string) gin.HandlerFunc {
		return func(c *gin.Context) {
			if !serveEmbeddedFile(c, relPath, cacheTopLevel, "") {
				c.Status(http.StatusNotFound)
			}
		}
	}

	router.GET("/"+viteSVGFilename, serveTopLevel(viteSVGFilename))
	router.HEAD("/"+viteSVGFilename, serveTopLevel(viteSVGFilename))
	router.GET("/"+logoFilename, serveTopLevel(logoFilename))
	router.HEAD("/"+logoFilename, serveTopLevel(logoFilename))
	router.GET("/"+thumbFilename, serveTopLevel(thumbFilename))
	router.HEAD("/"+thumbFilename, serveTopLevel(thumbFilename))

	router.NoRoute(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/api") {
			c.JSON(http.StatusNotFound, gin.H{"error": "API endpoint not found"})
			return
		}

		if c.Request.Method != http.MethodGet && c.Request.Method != http.MethodHead {
			c.Status(http.StatusNotFound)
			return
		}

		if !serveEmbeddedFile(c, indexHTMLFilename, cacheIndex, "text/html; charset=utf-8") {
			c.String(http.StatusInternalServerError, "Error loading page")
		}
	})
}
