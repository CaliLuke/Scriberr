# Refactor Plan: internal/web/static.go

The following checklist outlines a focused, incremental refactor to simplify static file serving, reduce duplication, improve correctness, and harden behavior. Each item is designed to be reviewable and verifiable on its own.

- [x] Replace manual `/assets/*` handler with `http.FileServer` mounted on `fs.Sub(staticFiles, "dist/assets")` using `http.StripPrefix("/assets", ...)` to prevent path traversal and leverage standard content-type, range, and caching behavior.
- [x] Add a small `GetAssetsHandler() http.Handler` helper returning `http.FileServer(http.FS(assetsFS))` where `assetsFS := fs.Sub(staticFiles, "dist/assets")` to keep initialization consistent and explicit.
- [x] Mount the assets handler in Gin using `router.GET("/assets/*filepath", func(c *gin.Context) { assets.ServeHTTP(c.Writer, c.Request) })` or `router.Handle("GET", "/assets/*filepath", gin.WrapH(http.StripPrefix("/assets", GetAssetsHandler())))` (choose one approach and apply consistently).
- [x] Introduce `serveEmbeddedFile(c *gin.Context, relPath string)` helper reading `staticFiles.ReadFile("dist/" + relPath)`, deriving content type via `mime.TypeByExtension(filepath.Ext(relPath))` with a default `application/octet-stream` fallback, and writing the response with `c.Data`.
- [x] Refactor the three top-level file routes (`/vite.svg`, `/scriberr-logo.png`, `/scriberr-thumb.png`) to call `serveEmbeddedFile` instead of duplicating read and write logic.
- [x] Define constants for repeated paths and prefixes (e.g., `const distDir = "dist"`, `const assetsPrefix = "/assets"`) to reduce "magic strings" and ease future structure changes.
- [x] Remove manual MIME branching for assets (current `strings.Contains` checks) in favor of automatic detection from `mime.TypeByExtension` used by the file server and helper.
- [x] Add cache headers for assets: set `Cache-Control: public, max-age=31536000, immutable` on all `/assets/*` responses to leverage content hashing emitted by Vite.
- [x] Add cache headers for top-level static files: set `Cache-Control: public, max-age=86400` for `/vite.svg`, `/scriberr-logo.png`, and `/scriberr-thumb.png` (adjust if these files are content-hashed; otherwise keep short-lived caching).
- [x] Ensure `index.html` is served with `Content-Type: text/html; charset=utf-8` and `Cache-Control: no-cache` so the SPA shell updates promptly.
- [x] Tighten SPA fallback: in `router.NoRoute`, only serve `index.html` for `GET` and `HEAD` methods; return `404` for other methods to avoid surprising non-idempotent fallbacks.
- [x] Preserve API 404 behavior by continuing to short-circuit when `strings.HasPrefix(path, "/api")`.
- [x] Log read errors using `pkg/logger` (zap) for both asset/helper reads and the `index.html` load path, including the requested path and error to aid debugging.
- [x] Remove the unused `authService *auth.AuthService` parameter from `SetupStaticRoutes` since static routes are public and do not consume it.
- [x] Update the callsite in `internal/api/router.go` to invoke `web.SetupStaticRoutes(router)` without `authService`; ensure imports remain correct.
- [x] Delete now-unreferenced helpers if they become redundant (e.g., `GetStaticHandler`) or adapt them to the new `GetAssetsHandler`/`serveEmbeddedFile` roles to avoid dead code.
- [x] Verify that embedded file serving avoids path traversal by construction (`fs.Sub` + `http.FileServer`), and that `/assets/../index.html` returns `404`.
- [x] Verify content types on common assets (CSS, JS, SVG, PNG) are correct via the standard library’s detection; add explicit fallbacks only when empty.
- [x] Add focused unit/integration tests using `httptest` + Gin: happy-path `/assets/*`, 404s for unknown assets, content-type assertions, cache header assertions, SPA fallbacks for unknown GET routes, and method behavior for non-GET requests.
- [x] Add a negative test ensuring `/assets/../index.html` is inaccessible (404) to cover traversal attempts.
- [ ] Manually verify production behavior by running the built binary: load root, navigate SPA deep-link routes, and validate assets load and cache headers using browser devtools.
- [ ] Manually verify development behavior remains unchanged (`npm run dev` + `go run cmd/server/main.go`) and that dev server routing still works; document any quirks if present.
- [ ] Update `README.md`/`docs` to briefly document the static serving approach, cache policy, and where to put new static assets.
- [x] Run `gofmt`/`go vet` and project linters; ensure diffs remain minimal and adhere to existing style.
- [x] Keep the refactor surgical: do not change unrelated routes or behavior; ensure minimal public API surface change (only removal of unused `authService` param on `SetupStaticRoutes`).
