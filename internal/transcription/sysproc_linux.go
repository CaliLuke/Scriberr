//go:build linux
// +build linux

package transcription

import (
	"os/exec"
	"syscall"
)

// ConfigureCmdSysProcAttr sets process group on Linux so we can kill children.
func ConfigureCmdSysProcAttr(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
}
