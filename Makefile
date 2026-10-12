# Common tasks. Run `make help`.
BIN      := bin/server
PKG      := ./cmd/server
BACKEND  ?= http://127.0.0.1:8080

.PHONY: help run build test vet fmt check docker clean

help: ## show this help
	@grep -E '^[a-z]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-8s %s\n", $$1, $$2}'

run: ## run locally against a backend (BACKEND=http://host:8080)
	BACKEND_URL=$(BACKEND) go run $(PKG)

build: ## build a small static binary into bin/
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o $(BIN) $(PKG)

test: ## run all tests
	go test ./...

vet: ## static checks
	go vet ./...

fmt: ## format the code
	gofmt -w .

check: ## what CI runs: formatting, vet, tests
	@test -z "$$(gofmt -l .)" || (echo "gofmt needed on:"; gofmt -l .; exit 1)
	go vet ./...
	go test ./...

docker: ## build the container image
	docker build -f deploy/Dockerfile -t restaurant-billing-admin .

clean: ## remove build output
	rm -rf bin
