// Package config reads and validates the runtime settings of the frontend server from environment variables.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"
)

// Config holds every setting the server needs. Build it with Load; it is read-only afterwards.
type Config struct {
	BackendURL      *url.URL      // where the backend API runs
	Addr            string        // listen address, e.g. ":3000"
	TLSCert, TLSKey string        // optional: serve HTTPS directly
	LogLevel        string        // debug | info | warn | error
	LogJSON         bool          // JSON logs (for log collectors) instead of text
	ShutdownTimeout time.Duration // how long in-flight requests get to finish on shutdown
}

// Load reads the environment. Unknown or malformed values are reported together so a deployment fails fast with a clear message.
func Load() (Config, error) { return load(os.Getenv) }

func load(get func(string) string) (Config, error) {
	var errs []string
	str := func(key, def string) string {
		if v := strings.TrimSpace(get(key)); v != "" {
			return v
		}
		return def
	}

	c := Config{
		Addr:     str("ADDR", ":"+str("PORT", "3000")), // hosting platforms usually provide PORT
		TLSCert:  str("TLS_CERT", ""),
		TLSKey:   str("TLS_KEY", ""),
		LogLevel: strings.ToLower(str("LOG_LEVEL", "info")),
		LogJSON:  strings.EqualFold(str("LOG_FORMAT", "text"), "json"),
	}

	raw := str("BACKEND_URL", "http://127.0.0.1:8080")
	u, err := url.Parse(raw)
	switch {
	case err != nil || u.Host == "":
		errs = append(errs, fmt.Sprintf("BACKEND_URL %q is not a valid address (example: http://127.0.0.1:8080)", raw))
	case u.Scheme != "http" && u.Scheme != "https":
		errs = append(errs, fmt.Sprintf("BACKEND_URL %q must start with http:// or https://", raw))
	default:
		u.Path = strings.TrimRight(u.Path, "/")
		c.BackendURL = u
	}

	switch c.LogLevel {
	case "debug", "info", "warn", "error":
	default:
		errs = append(errs, fmt.Sprintf("LOG_LEVEL %q must be debug, info, warn or error", c.LogLevel))
	}

	d, err := time.ParseDuration(str("SHUTDOWN_TIMEOUT", "15s"))
	if err != nil || d <= 0 {
		errs = append(errs, "SHUTDOWN_TIMEOUT must be a duration such as 15s")
	}
	c.ShutdownTimeout = d

	if (c.TLSCert == "") != (c.TLSKey == "") {
		errs = append(errs, "TLS_CERT and TLS_KEY must be set together")
	}

	if len(errs) > 0 {
		return Config{}, fmt.Errorf("invalid configuration:\n  - %s", strings.Join(errs, "\n  - "))
	}
	return c, nil
}
