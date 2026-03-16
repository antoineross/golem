package browser

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/chromedp/chromedp"
)

type Pool struct {
	cdpURL      string
	allocCtx    context.Context
	allocCancel context.CancelFunc
	mu          sync.Mutex
}

func NewPool(cdpURL string) (*Pool, error) {
	var allocCtx context.Context
	var allocCancel context.CancelFunc

	// If cdpURL is empty, use chromedp's bundled browser
	if cdpURL == "" {
		log.Printf("Using chromedp standalone mode (bundled Chrome)")
		allocCtx, allocCancel = chromedp.NewExecAllocator(context.Background(),
			append(chromedp.DefaultExecAllocatorOptions[:],
				chromedp.Flag("headless", true),
				chromedp.Flag("disable-gpu", true),
				chromedp.Flag("no-sandbox", true),
			)...)
	} else {
		// Create allocator context that connects to remote CDP server
		// Use chromedp.NoModifyURL to prevent querying /json/version (LightPanda compatibility)
		log.Printf("Connecting to remote CDP server at %s", cdpURL)
		allocCtx, allocCancel = chromedp.NewRemoteAllocator(context.Background(), cdpURL, chromedp.NoModifyURL)
	}

	pool := &Pool{
		cdpURL:      cdpURL,
		allocCtx:    allocCtx,
		allocCancel: allocCancel,
	}

	// Don't test connection on init - let it fail on first use
	// This allows container to start even if LightPanda isn't ready yet
	log.Printf("Browser pool initialized (connection will be tested on first use)")
	return pool, nil
}

func (p *Pool) testConnection() error {
	ctx, cancel := chromedp.NewContext(p.allocCtx)
	defer cancel()

	timeoutCtx, timeoutCancel := context.WithTimeout(ctx, 5*time.Second)
	defer timeoutCancel()

	// Simple test navigation
	var title string
	err := chromedp.Run(timeoutCtx,
		chromedp.Navigate("about:blank"),
		chromedp.Title(&title),
	)
	return err
}

// NewContext creates a new browser context for scraping
func (p *Pool) NewContext() (context.Context, context.CancelFunc) {
	// Use the shared allocator context (configured with NoModifyURL for LightPanda)
	return chromedp.NewContext(p.allocCtx)
}

// Close closes the pool and all connections
func (p *Pool) Close() {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.allocCancel != nil {
		p.allocCancel()
	}
}
