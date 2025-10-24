package config

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	"scriberr/pkg/logger"
)

// Config holds all configuration values
type Config struct {
	// Server configuration
	Port string
	Host string

	// Database configuration
	DatabasePath string

	// JWT configuration
	JWTSecret string

	// File storage
	UploadDir string

	// Python/WhisperX configuration
	UVPath      string
	WhisperXEnv string

	// Environment capabilities
	Environment Environment
}

// Environment describes host capabilities detected at startup.
type Environment struct {
	OS                   string
	Arch                 string
	SupportsNvidiaStack  bool
	SupportsMPS          bool
	DefaultWhisperDevice string
}

var environment Environment = detectEnvironment()

// Load loads configuration from environment variables and .env file
func Load() *Config {
	// Load .env file if it exists
	if err := godotenv.Load(); err != nil {
		logger.Debug("No .env file found, using system environment variables")
	}

	environment = detectEnvironment()

	return &Config{
		Port:         getEnv("PORT", "8080"),
		Host:         getEnv("HOST", "localhost"),
		DatabasePath: getEnv("DATABASE_PATH", "data/scriberr.db"),
		JWTSecret:    getJWTSecret(),
		UploadDir:    getEnv("UPLOAD_DIR", "data/uploads"),
		UVPath:       findUVPath(),
		WhisperXEnv:  getEnv("WHISPERX_ENV", "data/whisperx-env"),
		Environment:  environment,
	}
}

// EnvironmentInfo returns detected environment capabilities.
func EnvironmentInfo() Environment {
	return environment
}

// getEnv gets an environment variable with a default value
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

// getJWTSecret gets JWT secret from env or generates a secure random one
func getJWTSecret() string {
	if secret := os.Getenv("JWT_SECRET"); secret != "" {
		return secret
	}
	// Persist a dev secret across restarts to avoid invalidating tokens
	secretFile := getEnv("JWT_SECRET_FILE", "data/jwt_secret")
	if data, err := os.ReadFile(secretFile); err == nil && len(data) > 0 {
		return strings.TrimSpace(string(data))
	}
	// Generate a secure random JWT secret and persist it
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		logger.Warn("Could not generate secure JWT secret, using fallback", "error", err)
		return "fallback-jwt-secret-please-set-JWT_SECRET-env-var"
	}
	secret := hex.EncodeToString(bytes)
	// Ensure dir exists and write file (best-effort)
	_ = os.MkdirAll(filepath.Dir(secretFile), 0755)
	_ = os.WriteFile(secretFile, []byte(secret), 0600)
	logger.Debug("Generated persistent JWT secret", "path", secretFile)
	return secret
}

// findUVPath finds UV package manager in common locations
func findUVPath() string {
	if uvPath := os.Getenv("UV_PATH"); uvPath != "" {
		return uvPath
	}

	if path, err := exec.LookPath("uv"); err == nil {
		logger.Debug("Found UV package manager", "path", path)
		return path
	}

	logger.Warn("UV package manager not found in PATH, using fallback", "fallback", "uv")
	return "uv"
}

func detectEnvironment() Environment {
	goos := runtime.GOOS
	arch := runtime.GOARCH
	supportsNvidia := goos == "linux" && arch == "amd64"
	supportsMPS := goos == "darwin" && arch == "arm64"

	if v := os.Getenv("SCRIBERR_FORCE_NVIDIA"); v != "" {
		if forced, err := strconv.ParseBool(v); err == nil {
			supportsNvidia = forced
		}
	}
	if v := os.Getenv("SCRIBERR_DISABLE_NVIDIA"); v != "" {
		if disabled, err := strconv.ParseBool(v); err == nil && disabled {
			supportsNvidia = false
		}
	}
	if v := os.Getenv("SCRIBERR_DISABLE_MPS"); v != "" {
		if disabled, err := strconv.ParseBool(v); err == nil && disabled {
			supportsMPS = false
		}
	}

	defaultDevice := "cpu"
	if supportsMPS {
		defaultDevice = "mps"
	}
	if override := os.Getenv("SCRIBERR_DEFAULT_DEVICE"); override != "" {
		switch strings.ToLower(override) {
		case "cpu", "cuda", "mps", "auto":
			defaultDevice = strings.ToLower(override)
		default:
			logger.Warn("Ignoring invalid SCRIBERR_DEFAULT_DEVICE", "value", override)
		}
	}

	return Environment{
		OS:                   goos,
		Arch:                 arch,
		SupportsNvidiaStack:  supportsNvidia,
		SupportsMPS:          supportsMPS,
		DefaultWhisperDevice: defaultDevice,
	}
}

// Snapshot returns a map view of the loaded configuration suitable for logging.
func (c *Config) Snapshot() map[string]any {
	if c == nil {
		return map[string]any{}
	}

	return map[string]any{
		"port":          c.Port,
		"host":          c.Host,
		"database_path": c.DatabasePath,
		"jwt_secret":    c.JWTSecret,
		"upload_dir":    c.UploadDir,
		"uv_path":       c.UVPath,
		"whisperx_env":  c.WhisperXEnv,
		"environment": map[string]any{
			"os":                     c.Environment.OS,
			"arch":                   c.Environment.Arch,
			"supports_nvidia_stack":  c.Environment.SupportsNvidiaStack,
			"supports_mps":           c.Environment.SupportsMPS,
			"default_whisper_device": c.Environment.DefaultWhisperDevice,
		},
	}
}
