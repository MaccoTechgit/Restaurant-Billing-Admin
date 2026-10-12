package server

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// asset is one embedded file, prepared once at start-up: content type, a strong validator and (for text files) a gzip copy.
type asset struct {
	body  []byte
	gz    []byte
	etag  string
	ctype string
}

// staticFiles serves the embedded client. Every file is read, hashed and compressed once when the server starts,
// so requests cost almost nothing and the browser can revalidate with a cheap 304.
type staticFiles struct {
	assets map[string]*asset // key: slash path inside the embedded FS, e.g. "js/core.js"
}

// Files smaller than this are sent as they are: compressing them saves nothing worthwhile.
const minGzipSize = 1024

var contentTypes = map[string]string{
	".html": "text/html; charset=utf-8",
	".js":   "text/javascript; charset=utf-8",
	".css":  "text/css; charset=utf-8",
	".svg":  "image/svg+xml",
	".json": "application/json",
	".png":  "image/png",
	".ico":  "image/x-icon",
}

func newStaticFiles(fsys fs.FS) (*staticFiles, error) {
	s := &staticFiles{assets: map[string]*asset{}}
	err := fs.WalkDir(fsys, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() || strings.HasSuffix(p, ".go") {
			return err
		}
		body, err := fs.ReadFile(fsys, p)
		if err != nil {
			return err
		}
		ext := strings.ToLower(path.Ext(p))
		ct, ok := contentTypes[ext]
		if !ok {
			ct = "application/octet-stream"
		}
		sum := sha256.Sum256(body)
		a := &asset{body: body, ctype: ct, etag: `"` + hex.EncodeToString(sum[:10]) + `"`}
		if len(body) >= minGzipSize && (strings.HasPrefix(ct, "text/") || ext == ".svg" || ext == ".json") {
			var buf bytes.Buffer
			zw, _ := gzip.NewWriterLevel(&buf, gzip.BestCompression)
			zw.Write(body)
			zw.Close()
			if buf.Len() < len(body) {
				a.gz = buf.Bytes()
			}
		}
		s.assets[p] = a
		return nil
	})
	return s, err
}

// serve writes the asset stored under key. It returns false when there is no such file.
// cache is the Cache-Control value to send; extra headers can be added by the caller beforehand.
func (s *staticFiles) serve(w http.ResponseWriter, r *http.Request, key, cache string) bool {
	a, ok := s.assets[key]
	if !ok {
		return false
	}
	h := w.Header()
	body, etag := a.body, a.etag
	h.Set("Content-Type", a.ctype)
	h.Set("Cache-Control", cache)
	if a.gz != nil {
		h.Add("Vary", "Accept-Encoding")
		if acceptsGzip(r) {
			body, etag = a.gz, strings.TrimSuffix(a.etag, `"`)+`-gz"`
			h.Set("Content-Encoding", "gzip")
		}
	}
	h.Set("ETag", etag)
	if matches(r.Header.Get("If-None-Match"), etag) {
		w.WriteHeader(http.StatusNotModified)
		return true
	}
	h.Set("Content-Length", itoa(len(body)))
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write(body)
	}
	return true
}

func acceptsGzip(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}

// matches reports whether an If-None-Match header lists the given entity tag.
func matches(header, etag string) bool {
	for _, t := range strings.Split(header, ",") {
		if t = strings.TrimSpace(t); t == etag || t == "*" {
			return true
		}
	}
	return false
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [20]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}
