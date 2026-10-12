package server

import (
	"bufio"
	"compress/gzip"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/maccotechgit/restaurant-billing-admin/internal/config"
)

func quiet() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

// newTestServer starts a fake backend and a frontend in front of it.
func newTestServer(t *testing.T, backend http.Handler) (front *httptest.Server, be *httptest.Server) {
	t.Helper()
	be = httptest.NewServer(backend)
	t.Cleanup(be.Close)
	u, _ := url.Parse(be.URL)
	s, err := New(config.Config{BackendURL: u, Addr: ":0", LogLevel: "info", ShutdownTimeout: time.Second}, quiet())
	if err != nil {
		t.Fatal(err)
	}
	front = httptest.NewServer(s.Handler())
	t.Cleanup(front.Close)
	return front, be
}

func okBackend() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("/api/echo", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"path":"`+r.URL.Path+`","xff":"`+r.Header.Get("X-Forwarded-For")+`","rid":"`+r.Header.Get("X-Request-Id")+`","pad":"`+strings.Repeat("x", 2000)+`"}`)
	})
	mux.HandleFunc("/api/events", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.(http.Flusher).Flush()
		io.WriteString(w, "data: hello\n\n")
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	})
	return mux
}

func get(t *testing.T, url string, hdr ...string) (*http.Response, string) {
	t.Helper()
	req, _ := http.NewRequest("GET", url, nil)
	for i := 0; i+1 < len(hdr); i += 2 {
		req.Header.Set(hdr[i], hdr[i+1])
	}
	// do not let the client transparently decompress, so tests can see the raw encoding
	cl := &http.Client{Transport: &http.Transport{DisableCompression: true}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	resp, err := cl.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp, string(b)
}

func TestPagesAreServedWithSecurityHeaders(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	for _, p := range []string{"/login", "/app", "/qr", "/track", "/display"} {
		resp, body := get(t, f.URL+p)
		if resp.StatusCode != 200 || !strings.Contains(body, "<html") {
			t.Errorf("%s: status %d", p, resp.StatusCode)
		}
		if resp.Header.Get("Content-Security-Policy") == "" || resp.Header.Get("X-Frame-Options") != "DENY" || resp.Header.Get("X-Content-Type-Options") != "nosniff" {
			t.Errorf("%s: security headers missing", p)
		}
		if resp.Header.Get("X-Request-Id") == "" {
			t.Errorf("%s: no request id", p)
		}
	}
}

func TestRootRedirectsToLogin(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	resp, _ := get(t, f.URL+"/")
	if resp.StatusCode != 302 || resp.Header.Get("Location") != "/login" {
		t.Fatalf("got %d %q", resp.StatusCode, resp.Header.Get("Location"))
	}
}

func TestEveryAssetReferencedByAPageExists(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	for _, p := range []string{"/login", "/app", "/qr", "/track", "/display"} {
		_, body := get(t, f.URL+p)
		for _, part := range strings.Split(body, `"`) {
			if strings.HasPrefix(part, "/static/") {
				if resp, _ := get(t, f.URL+part); resp.StatusCode != 200 {
					t.Errorf("%s references %s -> %d", p, part, resp.StatusCode)
				}
			}
		}
	}
}

func TestStaticGzipEtagAndTypes(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	url := f.URL + "/static/js/core.js"
	resp, body := get(t, url, "Accept-Encoding", "gzip")
	if resp.Header.Get("Content-Encoding") != "gzip" || !strings.HasPrefix(resp.Header.Get("Content-Type"), "text/javascript") {
		t.Fatalf("expected gzip javascript, got %q %q", resp.Header.Get("Content-Encoding"), resp.Header.Get("Content-Type"))
	}
	zr, err := gzip.NewReader(strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	plain, _ := io.ReadAll(zr)
	if !strings.Contains(string(plain), "function") || len(body) >= len(plain) {
		t.Fatal("gzip body is not smaller / not javascript")
	}
	// revalidation: same ETag -> 304 with no body
	etag := resp.Header.Get("ETag")
	resp2, body2 := get(t, url, "Accept-Encoding", "gzip", "If-None-Match", etag)
	if resp2.StatusCode != 304 || body2 != "" {
		t.Fatalf("expected 304, got %d", resp2.StatusCode)
	}
	// without gzip support the plain file is returned with a different validator
	resp3, _ := get(t, url)
	if resp3.Header.Get("Content-Encoding") != "" || resp3.Header.Get("ETag") == etag {
		t.Fatal("plain response must not claim gzip")
	}
}

func TestStaticRejectsTraversalAndUnknownFiles(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	for _, p := range []string{"/static/../go.mod", "/static/%2e%2e/go.mod", "/static/pages/login.html", "/static/js/nope.js", "/static/embed.go", "/nothing-here"} {
		if resp, _ := get(t, f.URL+p); resp.StatusCode != 404 && resp.StatusCode != 400 && resp.StatusCode != 301 && resp.StatusCode != 307 && resp.StatusCode != 308 {
			t.Errorf("%s -> %d (want 404, 400 or a redirect)", p, resp.StatusCode)
		}
	}
}

func TestServiceWorkerIsServedFromRootScope(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	resp, body := get(t, f.URL+"/sw.js")
	if resp.StatusCode != 200 || resp.Header.Get("Service-Worker-Allowed") != "/" || !strings.Contains(body, "serviceWorker") && !strings.Contains(body, "addEventListener") {
		t.Fatalf("service worker wrong: %d %v", resp.StatusCode, resp.Header)
	}
}

func TestAPIIsProxiedWithForwardedHeadersAndGzip(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	resp, body := get(t, f.URL+"/api/echo", "Accept-Encoding", "gzip")
	if resp.StatusCode != 200 || resp.Header.Get("Content-Encoding") != "gzip" {
		t.Fatalf("expected gzipped json, got %d %q", resp.StatusCode, resp.Header.Get("Content-Encoding"))
	}
	zr, _ := gzip.NewReader(strings.NewReader(body))
	plain, _ := io.ReadAll(zr)
	s := string(plain)
	if !strings.Contains(s, `"path":"/api/echo"`) || !strings.Contains(s, `"xff":"127.0.0.1"`) || strings.Contains(s, `"rid":""`) {
		t.Fatalf("backend did not receive forwarded data: %.200s", s)
	}
}

func TestLiveUpdatesStreamImmediatelyAndAreNotCompressed(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	req, _ := http.NewRequest("GET", f.URL+"/api/events", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	cl := &http.Client{Transport: &http.Transport{DisableCompression: true}}
	resp, err := cl.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.Header.Get("Content-Encoding") != "" || resp.Header.Get("Content-Type") != "text/event-stream" {
		t.Fatalf("event stream must pass through untouched: %v", resp.Header)
	}
	done := make(chan string, 1)
	go func() { line, _ := bufio.NewReader(resp.Body).ReadString('\n'); done <- line }()
	select {
	case line := <-done:
		if !strings.HasPrefix(line, "data: hello") {
			t.Fatalf("unexpected first line %q", line)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("stream was buffered instead of flushed")
	}
}

func TestBackendDownGivesFriendlyJSON(t *testing.T) {
	f, be := newTestServer(t, okBackend())
	be.Close()
	resp, body := get(t, f.URL+"/api/echo")
	if resp.StatusCode != 502 || !strings.Contains(body, "not reachable") || !strings.HasPrefix(resp.Header.Get("Content-Type"), "application/json") {
		t.Fatalf("got %d %s", resp.StatusCode, body)
	}
}

func TestHealthAndReadiness(t *testing.T) {
	f, be := newTestServer(t, okBackend())
	if resp, body := get(t, f.URL+"/healthz"); resp.StatusCode != 200 || body != "ok" {
		t.Fatal("healthz")
	}
	if resp, _ := get(t, f.URL+"/readyz"); resp.StatusCode != 200 {
		t.Fatal("readyz should be ok while the backend is up")
	}
	be.Close()
	if resp, _ := get(t, f.URL+"/readyz"); resp.StatusCode != 503 {
		t.Fatal("readyz should be 503 when the backend is down")
	}
	if resp, _ := get(t, f.URL+"/healthz"); resp.StatusCode != 200 {
		t.Fatal("healthz must stay 200 (the frontend itself is alive)")
	}
}

func TestExistingRequestIDIsKept(t *testing.T) {
	f, _ := newTestServer(t, okBackend())
	resp, _ := get(t, f.URL+"/login", "X-Request-Id", "abc-123")
	if resp.Header.Get("X-Request-Id") != "abc-123" {
		t.Fatal("request id from the load balancer should be kept")
	}
}
