// Command server runs the Restaurant Billing Admin frontend.
//
// It serves the screens and forwards /api, /media and live updates to the backend. See README.md for the settings.
package main

import (
	"context"
	"crypto/tls"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/maccotechgit/restaurant-billing-admin/internal/config"
	"github.com/maccotechgit/restaurant-billing-admin/internal/server"
)

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe the running server on this machine and exit 0 (healthy) or 1 - for container health checks")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		slog.Error("cannot start", "error", err)
		os.Exit(2)
	}
	if *healthcheck {
		os.Exit(probe(cfg.Addr))
	}
	log := newLogger(cfg)

	srv, err := server.New(cfg, log)
	if err != nil {
		log.Error("cannot start", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := srv.Run(ctx); err != nil {
		log.Error("server stopped", "error", err)
		os.Exit(1)
	}
}

func newLogger(cfg config.Config) *slog.Logger {
	var lvl slog.Level
	_ = lvl.UnmarshalText([]byte(cfg.LogLevel))
	opts := &slog.HandlerOptions{Level: lvl}
	if cfg.LogJSON {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}

// probe calls the local /healthz endpoint; used by `server -healthcheck` because minimal container images have no curl.
func probe(addr string) int {
	host := addr
	if strings.HasPrefix(host, ":") {
		host = "127.0.0.1" + host
	}
	scheme := "http"
	if os.Getenv("TLS_CERT") != "" {
		scheme = "https"
	}
	cl := &http.Client{Timeout: 3 * time.Second}
	if scheme == "https" {
		cl.Transport = &http.Transport{TLSClientConfig: &tls.Config{InsecureSkipVerify: true}} // local probe only
	}
	resp, err := cl.Get(scheme + "://" + host + "/healthz")
	if err != nil {
		return 1
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 1
	}
	return 0
}
