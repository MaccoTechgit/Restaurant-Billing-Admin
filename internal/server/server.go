// Package server is the HTTP side of the frontend: it serves the embedded client and forwards API traffic to the backend.
// It contains no business logic - everything the screens show comes from the backend.
package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"path"
	"strings"
	"time"

	"github.com/maccotechgit/restaurant-billing-admin/internal/config"
	"github.com/maccotechgit/restaurant-billing-admin/web"
)

// Server wires the configuration, the embedded client and the reverse proxy into one http.Handler.
type Server struct {
	cfg     config.Config
	log     *slog.Logger
	static  *staticFiles
	proxy   http.Handler
	probe   *http.Client
	handler http.Handler
}

// pages maps a clean URL to the HTML file that renders it.
var pages = map[string]string{
	"/login":   "pages/login.html",
	"/app":     "pages/app.html",
	"/qr":      "pages/qr.html",
	"/track":   "pages/track.html",
	"/display": "pages/display.html",
}

// New builds the server. It fails early (before listening) if the embedded client cannot be prepared.
func New(cfg config.Config, log *slog.Logger) (*Server, error) {
	return newWithFS(cfg, log, web.FS)
}

func newWithFS(cfg config.Config, log *slog.Logger, client fs.FS) (*Server, error) {
	st, err := newStaticFiles(client)
	if err != nil {
		return nil, fmt.Errorf("prepare client files: %w", err)
	}
	s := &Server{cfg: cfg, log: log, static: st, probe: &http.Client{Timeout: 2 * time.Second}}
	s.proxy = s.newProxy()
	s.handler = chain(s.routes(), requestID, recoverer(log), accessLog(log), securityHeaders)
	return s, nil
}

// Handler returns the fully wrapped handler (used by tests and by Run).
func (s *Server) Handler() http.Handler { return s.handler }

func (s *Server) newProxy() http.Handler {
	target := s.cfg.BackendURL
	tr := &http.Transport{
		Proxy:                 nil,
		DialContext:           (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
		MaxIdleConns:          512,
		MaxIdleConnsPerHost:   256, // many browsers share a few backend connections
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   5 * time.Second,
		ResponseHeaderTimeout: 60 * time.Second,
		ForceAttemptHTTP2:     true,
	}
	return &httputil.ReverseProxy{
		Transport: tr,
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.SetXForwarded() // the backend sees the real visitor address
		},
		FlushInterval: -1, // stream live updates (server-sent events) immediately
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			if !errors.Is(err, context.Canceled) {
				s.log.Warn("backend unreachable", "request_id", r.Header.Get("X-Request-Id"), "error", err.Error())
			}
			writeJSON(w, http.StatusBadGateway, map[string]string{"error": "The server is not reachable right now. Please try again in a moment."})
		},
	}
}

func (s *Server) routes() http.Handler {
	mux := http.NewServeMux()

	// operations
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("GET /readyz", s.ready)

	// everything dynamic is the backend's job
	api := gzipJSON(s.proxy)
	mux.Handle("/api/", api)
	mux.Handle("/media/", s.proxy)
	mux.Handle("/manifest.webmanifest", api)

	// screens
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) { http.Redirect(w, r, "/login", http.StatusFound) })
	for url, file := range pages {
		file := file
		mux.HandleFunc("GET "+url, func(w http.ResponseWriter, r *http.Request) { s.static.serve(w, r, file, "no-cache") })
	}

	// client code
	mux.HandleFunc("GET /static/{path...}", func(w http.ResponseWriter, r *http.Request) {
		key := path.Clean(r.PathValue("path"))
		if strings.HasPrefix(key, "..") || !(strings.HasPrefix(key, "js/") || strings.HasPrefix(key, "css/") || strings.HasPrefix(key, "assets/")) || !s.static.serve(w, r, key, "no-cache") {
			s.notFound(w, r)
		}
	})
	mux.HandleFunc("GET /sw.js", func(w http.ResponseWriter, r *http.Request) { // must live at the root to control the whole site
		w.Header().Set("Service-Worker-Allowed", "/")
		s.static.serve(w, r, "assets/sw.js", "no-cache")
	})
	mux.HandleFunc("GET /icon.svg", func(w http.ResponseWriter, r *http.Request) {
		s.static.serve(w, r, "assets/icon.svg", "public, max-age=86400")
	})

	mux.HandleFunc("/", s.notFound)
	return mux
}

func (s *Server) notFound(w http.ResponseWriter, r *http.Request) {
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	http.Error(w, "Page not found", http.StatusNotFound)
}

// ready answers load balancers: 200 only when the backend answers too.
func (s *Server) ready(w http.ResponseWriter, r *http.Request) {
	req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, s.cfg.BackendURL.String()+"/healthz", nil)
	resp, err := s.probe.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "degraded", "backend": "down"})
		return
	}
	resp.Body.Close()
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "backend": "up"})
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}

// Run listens until ctx is cancelled, then shuts down gracefully (in-flight requests get cfg.ShutdownTimeout to finish).
func (s *Server) Run(ctx context.Context) error {
	srv := &http.Server{
		Addr:              s.cfg.Addr,
		Handler:           s.handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       60 * time.Second,
		// no WriteTimeout: live-update streams stay open for hours
		IdleTimeout:    120 * time.Second,
		MaxHeaderBytes: 16 << 10,
		ErrorLog:       slog.NewLogLogger(s.log.Handler(), slog.LevelWarn),
	}
	errc := make(chan error, 1)
	go func() {
		s.log.Info("listening", "addr", s.cfg.Addr, "backend", s.cfg.BackendURL.String(), "tls", s.cfg.TLSCert != "")
		if s.cfg.TLSCert != "" {
			errc <- srv.ListenAndServeTLS(s.cfg.TLSCert, s.cfg.TLSKey)
		} else {
			errc <- srv.ListenAndServe()
		}
	}()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		s.log.Info("shutting down", "grace", s.cfg.ShutdownTimeout.String())
		sctx, cancel := context.WithTimeout(context.Background(), s.cfg.ShutdownTimeout)
		defer cancel()
		if err := srv.Shutdown(sctx); err != nil {
			srv.Close()
			return err
		}
		return nil
	}
}
