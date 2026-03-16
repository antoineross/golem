package scrape

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"io"
	"net/http"
	"testing"

	"github.com/andybalholm/brotli"
)

func makeResponse(encoding string, body []byte) *http.Response {
	return &http.Response{
		Header: http.Header{"Content-Encoding": {encoding}},
		Body:   io.NopCloser(bytes.NewReader(body)),
	}
}

func compressGzip(t *testing.T, data string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := gzip.NewWriter(&buf)
	if _, err := w.Write([]byte(data)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func compressDeflate(t *testing.T, data string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w, err := flate.NewWriter(&buf, flate.DefaultCompression)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := w.Write([]byte(data)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func compressBrotli(t *testing.T, data string) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := brotli.NewWriter(&buf)
	if _, err := w.Write([]byte(data)); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func TestDecompressBody(t *testing.T) {
	const payload = "<html><body><h1>Hello World</h1></body></html>"

	tests := []struct {
		name     string
		encoding string
		body     []byte
		want     string
	}{
		{
			name:     "gzip encoding",
			encoding: "gzip",
			body:     compressGzip(t, payload),
			want:     payload,
		},
		{
			name:     "deflate encoding",
			encoding: "deflate",
			body:     compressDeflate(t, payload),
			want:     payload,
		},
		{
			name:     "brotli encoding",
			encoding: "br",
			body:     compressBrotli(t, payload),
			want:     payload,
		},
		{
			name:     "identity encoding",
			encoding: "identity",
			body:     []byte(payload),
			want:     payload,
		},
		{
			name:     "empty encoding",
			encoding: "",
			body:     []byte(payload),
			want:     payload,
		},
		{
			name:     "unknown encoding falls through",
			encoding: "custom-enc",
			body:     []byte(payload),
			want:     payload,
		},
		{
			name:     "zstd falls through to raw",
			encoding: "zstd",
			body:     []byte(payload),
			want:     payload,
		},
		{
			name:     "gzip with whitespace in header",
			encoding: " gzip ",
			body:     compressGzip(t, payload),
			want:     payload,
		},
		{
			name:     "GZIP uppercase",
			encoding: "GZIP",
			body:     compressGzip(t, payload),
			want:     payload,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			resp := makeResponse(tt.encoding, tt.body)
			reader, err := decompressBody(resp)
			if err != nil {
				t.Fatalf("decompressBody() error = %v", err)
			}
			got, err := io.ReadAll(reader)
			if err != nil {
				t.Fatalf("ReadAll() error = %v", err)
			}
			if string(got) != tt.want {
				t.Errorf("got %q, want %q", string(got), tt.want)
			}
		})
	}
}

func TestDecompressBodyGzipInvalid(t *testing.T) {
	resp := makeResponse("gzip", []byte("not valid gzip data"))
	_, err := decompressBody(resp)
	if err == nil {
		t.Error("expected error for invalid gzip data, got nil")
	}
}

func TestDecompressBodyLargePayload(t *testing.T) {
	large := bytes.Repeat([]byte("<p>paragraph</p>"), 10000)
	compressed := compressGzip(t, string(large))

	resp := makeResponse("gzip", compressed)
	reader, err := decompressBody(resp)
	if err != nil {
		t.Fatalf("decompressBody() error = %v", err)
	}
	got, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("ReadAll() error = %v", err)
	}
	if !bytes.Equal(got, large) {
		t.Errorf("decompressed size %d, want %d", len(got), len(large))
	}
}
