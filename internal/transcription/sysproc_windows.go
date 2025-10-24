//go:build windows
// +build windows

package transcription

import "os/exec"

// ConfigureCmdSysProcAttr is a no-op on Windows to keep builds portable.
// If full process tree termination is required, implement Windows-specific
// logic (e.g., using job objects) in the future.
func ConfigureCmdSysProcAttr(cmd *exec.Cmd) {
	// No special attributes set on Windows here
}
