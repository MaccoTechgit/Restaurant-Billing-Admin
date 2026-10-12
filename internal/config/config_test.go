package config

import (
	"strings"
	"testing"
	"time"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaults(t *testing.T) {
	c, err := load(env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.BackendURL.String() != "http://127.0.0.1:8080" || c.Addr != ":3000" || c.LogLevel != "info" || c.ShutdownTimeout != 15*time.Second {
		t.Fatalf("unexpected defaults: %+v", c)
	}
}

func TestPortFallbackAndTrailingSlash(t *testing.T) {
	c, err := load(env(map[string]string{"PORT": "8099", "BACKEND_URL": "https://api.example.com/"}))
	if err != nil {
		t.Fatal(err)
	}
	if c.Addr != ":8099" || c.BackendURL.String() != "https://api.example.com" {
		t.Fatalf("got %q %q", c.Addr, c.BackendURL)
	}
}

func TestAddrBeatsPort(t *testing.T) {
	c, _ := load(env(map[string]string{"PORT": "1", "ADDR": "127.0.0.1:9000"}))
	if c.Addr != "127.0.0.1:9000" {
		t.Fatal(c.Addr)
	}
}

func TestInvalidValuesAreAllReported(t *testing.T) {
	_, err := load(env(map[string]string{"BACKEND_URL": "not a url", "LOG_LEVEL": "loud", "SHUTDOWN_TIMEOUT": "soon", "TLS_CERT": "c.pem"}))
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, want := range []string{"BACKEND_URL", "LOG_LEVEL", "SHUTDOWN_TIMEOUT", "TLS_CERT and TLS_KEY"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error should mention %s: %v", want, err)
		}
	}
}

func TestBackendSchemeMustBeHTTP(t *testing.T) {
	if _, err := load(env(map[string]string{"BACKEND_URL": "ftp://x.example.com"})); err == nil {
		t.Fatal("ftp must be rejected")
	}
}
