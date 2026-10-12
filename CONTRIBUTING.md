# Contributing

1. Create a branch from `main`.
2. Make the change. Keep the server free of business logic - that belongs in the backend.
3. Run `make check` (gofmt, vet, tests). New server behaviour needs a test in `internal/server`.
4. Client changes: keep files under `web/` in their folders; a new screen goes in `web/js/modules/` and is added to `web/pages/app.html`.
5. Open a pull request. CI must be green.

Commit messages: one short imperative line, then a short explanation if the reason is not obvious.
