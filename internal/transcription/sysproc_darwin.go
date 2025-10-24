//go:build darwin
// +build darwin

package transcription

import (
	"os/exec"
	"syscall"
)

// ConfigureCmdSysProcAttr sets process group on macOS so we can kill children.
func ConfigureCmdSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
