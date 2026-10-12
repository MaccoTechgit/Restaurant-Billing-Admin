// Package web holds the browser client (pages, JavaScript, CSS, icons) and embeds it into the server binary,
// so the whole frontend ships as one self-contained program.
package web

import "embed"

// FS contains the client files, laid out exactly as they appear in the repository:
//
//	pages/   HTML screens          (served at /login, /app, /qr, /track, /display)
//	js/      application code      (served under /static/js/)
//	css/     styles                (served under /static/css/)
//	assets/  icon and service worker
//
//go:embed pages js css assets
var FS embed.FS
