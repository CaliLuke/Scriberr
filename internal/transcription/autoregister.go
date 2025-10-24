package transcription

// Import adapter packages for their init() side effects, ensuring model
// registrations are wired up whenever the transcription package is used.
import (
	_ "scriberr/internal/transcription/adapters"
)
