package logger

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Field re-exports zapcore.Field so callers don't need to import zap directly.
type Field = zapcore.Field

var (
	defaultLogger *zap.Logger
	atomicLevel   = zap.NewAtomicLevelAt(zapcore.InfoLevel)
	mtx           sync.Mutex
)

const (
	defaultLogFile = "data/logs/scriberr.log"
)

// Init configures the global logger. It is safe to call multiple times; the
// last call wins and refreshes the logger based on current environment.
func Init(level string) {
	mtx.Lock()
	defer mtx.Unlock()

	parsedLevel := zapcore.InfoLevel
	if level != "" {
		if err := parsedLevel.Set(strings.ToLower(level)); err != nil {
			fmt.Fprintf(os.Stderr, "invalid LOG_LEVEL %q, defaulting to INFO: %v\n", level, err)
			parsedLevel = zapcore.InfoLevel
		}
	}
	atomicLevel.SetLevel(parsedLevel)

	consoleEncoder := zapcore.NewConsoleEncoder(zapcore.EncoderConfig{
		TimeKey:          "time",
		LevelKey:         "level",
		NameKey:          "logger",
		CallerKey:        "",
		MessageKey:       "msg",
		StacktraceKey:    "stack",
		LineEnding:       zapcore.DefaultLineEnding,
		EncodeTime:       zapcore.TimeEncoderOfLayout("15:04:05"),
		EncodeDuration:   zapcore.StringDurationEncoder,
		EncodeLevel:      capitalPaddedLevelEncoder,
		ConsoleSeparator: " ",
	})

	consoleCore := zapcore.NewCore(
		consoleEncoder,
		zapcore.Lock(os.Stdout),
		atomicLevel,
	)

	cores := []zapcore.Core{consoleCore}

	if fileSyncer := openLogFile(); fileSyncer != nil {
		jsonEncoder := zapcore.NewJSONEncoder(zapcore.EncoderConfig{
			TimeKey:        "timestamp",
			LevelKey:       "level",
			NameKey:        "logger",
			CallerKey:      "caller",
			MessageKey:     "message",
			StacktraceKey:  "stacktrace",
			EncodeLevel:    zapcore.LowercaseLevelEncoder,
			EncodeTime:     zapcore.RFC3339TimeEncoder,
			EncodeDuration: zapcore.StringDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		})
		fileCore := zapcore.NewCore(jsonEncoder, fileSyncer, atomicLevel)
		cores = append(cores, fileCore)
	}

	core := zapcore.NewTee(cores...)

	defaultLogger = zap.New(core,
		zap.AddStacktrace(zapcore.ErrorLevel),
		zap.AddCaller(),
		zap.AddCallerSkip(1),
	)
}

func capitalPaddedLevelEncoder(level zapcore.Level, enc zapcore.PrimitiveArrayEncoder) {
	switch level {
	case zapcore.InfoLevel:
		enc.AppendString("INFO ")
	case zapcore.WarnLevel:
		enc.AppendString("WARN ")
	case zapcore.ErrorLevel:
		enc.AppendString("ERROR")
	case zapcore.DebugLevel:
		enc.AppendString("DEBUG")
	default:
		enc.AppendString(strings.ToUpper(level.String()))
	}
}

func openLogFile() zapcore.WriteSyncer {
	path := strings.TrimSpace(os.Getenv("LOG_FILE"))
	if path == "" {
		path = defaultLogFile
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create log directory %q: %v\n", filepath.Dir(path), err)
		return nil
	}

	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to open log file %q: %v\n", path, err)
		return nil
	}

	return zapcore.AddSync(f)
}

// Sync flushes any buffered log entries.
func Sync() error {
	if defaultLogger == nil {
		return nil
	}
	return defaultLogger.Sync()
}

// SetLevel allows dynamic adjustments at runtime.
func SetLevel(level zapcore.Level) {
	atomicLevel.SetLevel(level)
}

// Level reports the current log level.
func Level() zapcore.Level {
	return atomicLevel.Level()
}

// Get returns the configured logger, initializing it if needed.
func Get() *zap.Logger {
	if defaultLogger == nil {
		Init(os.Getenv("LOG_LEVEL"))
	}
	return defaultLogger
}

// With returns a child logger with additional context.
func With(fields ...Field) *zap.Logger {
	return Get().With(fields...)
}

// Debug logs at DEBUG level.
func Debug(msg string, fields ...any) {
	Get().Debug(msg, normalizeFields(fields...)...)
}

// Info logs at INFO level.
func Info(msg string, fields ...any) {
	Get().Info(msg, normalizeFields(fields...)...)
}

// Warn logs at WARN level.
func Warn(msg string, fields ...any) {
	Get().Warn(msg, normalizeFields(fields...)...)
}

// Error logs at ERROR level.
func Error(msg string, fields ...any) {
	Get().Error(msg, normalizeFields(fields...)...)
}

// Startup provides consistent boot-time logging.
func Startup(component, message string, fields ...any) {
	base := []any{"component", component}
	all := append(base, fields...)
	Info(message, all...)
}

// JobStarted records job begin events.
func JobStarted(jobID, filename, model string, params map[string]any) {
	Info("Transcription started",
		String("job_id", jobID),
		String("file", filename),
		String("model", model),
		Any("params", params),
	)
}

// JobCompleted records successful job completion.
func JobCompleted(jobID string, duration time.Duration, result any) {
	Info("Transcription completed",
		String("job_id", jobID),
		Duration("duration", duration),
		Any("result", result),
	)
}

// JobFailed records job failures.
func JobFailed(jobID string, duration time.Duration, err error) {
	Error("Transcription failed",
		String("job_id", jobID),
		Duration("duration", duration),
		ErrorField(err),
	)
}

// AuthEvent tracks authentication events.
func AuthEvent(event, username, ip string, success bool, details ...any) {
	base := fieldsToAny([]Field{
		String("event", event),
		String("username", username),
		String("ip", ip),
		Bool("success", success),
	})
	all := append(base, details...)

	if success {
		Info("User authentication succeeded", all...)
	} else {
		Warn("User authentication failed", all...)
	}
}

// WorkerOperation logs queue worker lifecycle events at debug level.
func WorkerOperation(workerID int, jobID string, operation string, details ...any) {
	base := fieldsToAny([]Field{
		Int("worker_id", workerID),
		String("job_id", jobID),
		String("operation", operation),
	})
	Debug("Worker operation", append(base, details...)...)
}

// Performance emits timing information for instrumentation.
func Performance(operation string, duration time.Duration, details ...any) {
	base := fieldsToAny([]Field{
		String("operation", operation),
		Duration("duration", duration),
		DurationMillis("duration_ms", duration),
	})
	Debug("Performance metric", append(base, details...)...)
}

// HTTPRequest logs generic HTTP request information.
func HTTPRequest(method, path string, status int, duration time.Duration, userAgent string) {
	fields := []Field{
		String("method", method),
		String("path", path),
		Int("status", status),
		DurationMillis("duration_ms", duration),
	}
	if userAgent != "" {
		fields = append(fields, String("user_agent", userAgent))
	}
	Info("HTTP request", fieldsToAny(fields)...)
}

// GinLogger emits structured logs for HTTP requests and attaches a request-scoped logger.
func GinLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path
		raw := c.Request.URL.RawQuery
		if raw != "" {
			path += "?" + raw
		}

		reqLogger := With(
			String("method", c.Request.Method),
			String("path", path),
		)

		ctx := WithLogger(c.Request.Context(), reqLogger)
		c.Request = c.Request.WithContext(ctx)

		c.Next()

		duration := time.Since(start)
		status := c.Writer.Status()

		fields := []Field{
			Int("status", status),
			DurationMillis("duration_ms", duration),
			String("client_ip", c.ClientIP()),
		}
		if size := c.Writer.Size(); size > 0 {
			fields = append(fields, Int("bytes", size))
		}

		switch {
		case status >= 500:
			reqLogger.Error("HTTP request failed", fields...)
		case status >= 400:
			reqLogger.Warn("HTTP request", fields...)
		default:
			reqLogger.Info("HTTP request", fields...)
		}
	}
}

// SetGinOutput suppresses Gin's default logging.
func SetGinOutput() {
	gin.DefaultWriter = io.Discard
}

// ErrorField creates a zap field for an error, handling nil safely.
func ErrorField(err error) Field {
	if err == nil {
		return zap.Skip()
	}
	return zap.Error(err)
}

// Field helpers re-export common zap constructors for convenience.
func Any(key string, value any) Field   { return zap.Any(key, value) }
func Bool(key string, value bool) Field { return zap.Bool(key, value) }
func Duration(key string, value time.Duration) Field {
	return zap.Duration(key, value)
}
func DurationMillis(key string, value time.Duration) Field {
	return zap.Float64(key, float64(value)/float64(time.Millisecond))
}
func Float64(key string, value float64) Field { return zap.Float64(key, value) }
func Int(key string, value int) Field         { return zap.Int(key, value) }
func Int64(key string, value int64) Field     { return zap.Int64(key, value) }
func String(key, value string) Field          { return zap.String(key, value) }
func Stringer(key string, value fmt.Stringer) Field {
	return zap.Stringer(key, value)
}
func Time(key string, value time.Time) Field { return zap.Time(key, value) }

func fieldsToAny(fields []Field) []any {
	if len(fields) == 0 {
		return nil
	}
	args := make([]any, len(fields))
	for i, f := range fields {
		args[i] = f
	}
	return args
}

// normalizeFields converts a variadic list of fields into zap fields, allowing
// callers to pass either zap Fields or key/value pairs.
func normalizeFields(fields ...any) []Field {
	if len(fields) == 0 {
		return nil
	}

	result := make([]Field, 0, len(fields))
	for i := 0; i < len(fields); i++ {
		switch v := fields[i].(type) {
		case Field:
			result = append(result, v)
		case string:
			if i+1 < len(fields) {
				result = append(result, zap.Any(v, fields[i+1]))
				i++
			} else {
				result = append(result, zap.String(v, "<missing>"))
			}
		default:
			result = append(result, zap.Any(fmt.Sprintf("arg_%d", i), v))
		}
	}
	return result
}

type contextKey struct{}

// WithLogger stores the provided logger in the context.
func WithLogger(ctx context.Context, logger *zap.Logger) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, contextKey{}, logger)
}

// ContextWith returns a new context enriched with the provided fields.
func ContextWith(ctx context.Context, fields ...Field) context.Context {
	current := FromContext(ctx)
	return WithLogger(ctx, current.With(fields...))
}

// FromContext extracts a logger from the context or returns the global logger.
func FromContext(ctx context.Context) *zap.Logger {
	if ctx != nil {
		if logger, ok := ctx.Value(contextKey{}).(*zap.Logger); ok && logger != nil {
			return logger
		}
	}
	return Get()
}

// C returns a context-scoped logger.
func C(ctx context.Context) *zap.Logger {
	return FromContext(ctx)
}
