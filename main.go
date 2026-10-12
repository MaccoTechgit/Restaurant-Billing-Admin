// TableBill frontend: serves the screens (HTML/CSS/JS) and forwards /api, /media and the
// live-update stream to the backend program. It contains no business logic.
//
//	BACKEND_URL  where the backend runs      (default http://127.0.0.1:8080)
//	ADDR         where this server listens   (default :3000)
//	TLS_CERT / TLS_KEY   optional HTTPS
package main

import (
	"embed"
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"
)

//go:embed *.html *.js *.css *.svg
var files embed.FS

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func main() {
	target, err := url.Parse(env("BACKEND_URL", "http://127.0.0.1:8080"))
	if err != nil || target.Host == "" {
		log.Fatal("BACKEND_URL is not a valid address")
	}
	static := http.FileServer(http.FS(mustSub(files)))
	pages := map[string]string{"/login": "/login.html", "/app": "/app.html", "/qr": "/qr.html", "/track": "/track.html", "/display": "/display.html"}

	proxy := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.SetXForwarded() // the backend sees the real visitor address
		},
		FlushInterval: -1, // stream live updates (server-sent events) immediately
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			log.Printf("backend unreachable: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(map[string]string{"error": "The server is not reachable right now. Please try again in a moment."})
		},
	}

	mux := http.NewServeMux()
	for _, p := range []string{"/api/", "/media/", "/healthz", "/manifest.webmanifest"} {
		mux.Handle(p, proxy)
	}
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/login", http.StatusFound)
			return
		}
		if p, ok := pages[r.URL.Path]; ok {
			r.URL.Path = p
		}
		w.Header().Set("Cache-Control", "no-cache")
		static.ServeHTTP(w, r)
	})

	srv := &http.Server{Addr: env("ADDR", ":3000"), Handler: headers(mux), ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 120 * time.Second, MaxHeaderBytes: 16 << 10}
	log.Printf("TableBill frontend on %s  ->  backend %s", srv.Addr, target)
	if cert, key := os.Getenv("TLS_CERT"), os.Getenv("TLS_KEY"); cert != "" && key != "" {
		log.Fatal(srv.ListenAndServeTLS(cert, key))
	}
	log.Fatal(srv.ListenAndServe())
}

func mustSub(f embed.FS) fs.FS { return f }

// headers adds the browser-side protections to every page this server hands out.
func headers(next http.Handler) http.Handler {
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
