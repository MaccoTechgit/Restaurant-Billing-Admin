package server

import (
	"bufio"
	"compress/gzip"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

// chain wraps h with the middleware in the order given (the first one is the outermost).
func chain(h http.Handler, mws ...func(http.Handler) http.Handler) http.Handler {
	for i := len(mws) - 1; i >= 0; i-- {
		h = mws[i](h)
	}
	return h
}

// statusWriter records the status and size of a response and still supports streaming (Flush) and hijacking.
type statusWriter struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (w *statusWriter) WriteHeader(c int) {
	if w.status == 0 {
		w.status = c
	}
	w.ResponseWriter.WriteHeader(c)
}
func (w *statusWriter) Write(b []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	n, err := w.ResponseWriter.Write(b)
	w.bytes += n
	return n, err
}
func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	if h, ok := w.ResponseWriter.(http.Hijacker); ok {
		return h.Hijack()
	}
	return nil, nil, errors.New("hijacking not supported")
}
func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// requestID gives every request an id (kept if the caller or a load balancer already set one) and echoes it back.
func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-Id")
		if len(id) == 0 || len(id) > 64 {
			var b [8]byte
			rand.Read(b[:])
			id = hex.EncodeToString(b[:])
			r.Header.Set("X-Request-Id", id) // passed on to the backend
		}
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r)
	})
}

// recoverer turns a panic into a 500 response and a log line instead of a dropped connection.
func recoverer(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					if v == http.ErrAbortHandler { // the standard way to abort a response (used by the proxy when a client leaves)
						panic(v)
					}
					log.Error("panic", "request_id", r.Header.Get("X-Request-Id"), "panic", v, "stack", string(debug.Stack()))
					http.Error(w, "Something went wrong.", http.StatusInternalServerError)
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

// accessLog writes one structured line per request. Query strings are not logged because they can carry tokens.
func accessLog(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			sw := &statusWriter{ResponseWriter: w}
			next.ServeHTTP(sw, r)
			if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
				return
			}
			log.Info("request", "request_id", r.Header.Get("X-Request-Id"), "method", r.Method, "path", r.URL.Path, "status", sw.status, "bytes", sw.bytes, "ms", time.Since(start).Milliseconds())
		})
	}
}

// securityHeaders adds the browser-side protections to every response this server produces.
func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)")
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

// gzipJSON compresses text and JSON responses coming from the backend. Live-update streams (text/event-stream) and
// already-compressed responses are passed through untouched and keep flushing immediately.
func gzipJSON(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !acceptsGzip(r) || r.Header.Get("Upgrade") != "" {
			next.ServeHTTP(w, r)
			return
		}
		gw := &gzipResponse{ResponseWriter: w}
		defer gw.close()
		next.ServeHTTP(gw, r)
	})
}

type gzipResponse struct {
	http.ResponseWriter
	zw      *gzip.Writer
	decided bool
}

func (g *gzipResponse) decide() {
	if g.decided {
		return
	}
	g.decided = true
	h := g.Header()
	ct := h.Get("Content-Type")
	compressible := (strings.HasPrefix(ct, "application/json") || strings.HasPrefix(ct, "text/plain") || strings.HasPrefix(ct, "text/csv") ||
		strings.HasPrefix(ct, "text/html") || strings.HasPrefix(ct, "application/xml")) && h.Get("Content-Encoding") == ""
	if compressible {
		h.Del("Content-Length")
		h.Set("Content-Encoding", "gzip")
		h.Add("Vary", "Accept-Encoding")
		g.zw = gzip.NewWriter(g.ResponseWriter)
	}
}
func (g *gzipResponse) WriteHeader(c int) { g.decide(); g.ResponseWriter.WriteHeader(c) }
func (g *gzipResponse) Write(b []byte) (int, error) {
	g.decide()
	if g.zw != nil {
		return g.zw.Write(b)
	}
	return g.ResponseWriter.Write(b)
}
func (g *gzipResponse) Flush() {
	if g.zw != nil {
		g.zw.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
func (g *gzipResponse) close() {
	if g.zw != nil {
		g.zw.Close()
	}
}
func (g *gzipResponse) Unwrap() http.ResponseWriter { return g.ResponseWriter }
