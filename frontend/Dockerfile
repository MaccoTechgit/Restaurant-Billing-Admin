# Frontend: screens + proxy to the backend.
FROM golang:1.26 AS build
WORKDIR /src
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /tablebill-frontend .

FROM gcr.io/distroless/static
COPY --from=build /tablebill-frontend /tablebill-frontend
ENV BACKEND_URL=http://backend:8080 ADDR=:3000
EXPOSE 3000
ENTRYPOINT ["/tablebill-frontend"]
