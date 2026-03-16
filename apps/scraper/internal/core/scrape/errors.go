package scrape

import (
	"fmt"
	"net/http"
)

// ScrapeError represents a structured error from scraping operations
type ScrapeError struct {
	StatusCode int    // HTTP status code to return to client
	Message    string // Human-readable error message
	Type       string // Error type for categorization
}

func (e *ScrapeError) Error() string {
	return e.Message
}

// Predefined error types
const (
	ErrorTypeBadRequest    = "bad_request"
	ErrorTypeUnauthorized  = "unauthorized"
	ErrorTypeForbidden     = "forbidden"
	ErrorTypeNotFound      = "not_found"
	ErrorTypeTooManyReqs   = "too_many_requests"
	ErrorTypeTimeout       = "timeout"
	ErrorTypeServerError   = "server_error"
	ErrorTypeRobotsBlocked = "robots_blocked"
	ErrorTypeLowQuality    = "low_quality_content"
)

// Error constructors for common scraping errors

// NewBadRequestError creates a 400 error
func NewBadRequestError(message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusBadRequest,
		Message:    message,
		Type:       ErrorTypeBadRequest,
	}
}

// NewUnauthorizedError creates a 401 error
func NewUnauthorizedError(message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusUnauthorized,
		Message:    message,
		Type:       ErrorTypeUnauthorized,
	}
}

// NewForbiddenError creates a 403 error
func NewForbiddenError(message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusForbidden,
		Message:    message,
		Type:       ErrorTypeForbidden,
	}
}

// NewNotFoundError creates a 404 error
func NewNotFoundError(message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusNotFound,
		Message:    message,
		Type:       ErrorTypeNotFound,
	}
}

// NewTooManyRequestsError creates a 429 error
func NewTooManyRequestsError(message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusTooManyRequests,
		Message:    message,
		Type:       ErrorTypeTooManyReqs,
	}
}

// NewTimeoutError creates a 408 error
func NewTimeoutError(message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusRequestTimeout,
		Message:    message,
		Type:       ErrorTypeTimeout,
	}
}

// NewServerError creates a 500+ error
func NewServerError(statusCode int, message string) *ScrapeError {
	return &ScrapeError{
		StatusCode: statusCode,
		Message:    message,
		Type:       ErrorTypeServerError,
	}
}

// NewRobotsBlockedError creates an error for robots.txt blocking
func NewRobotsBlockedError(url string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusForbidden,
		Message:    fmt.Sprintf("Scraping blocked by robots.txt for %s", url),
		Type:       ErrorTypeRobotsBlocked,
	}
}

// NewLowQualityContentError creates an error for filtered content
func NewLowQualityContentError(url string) *ScrapeError {
	return &ScrapeError{
		StatusCode: http.StatusUnprocessableEntity,
		Message:    fmt.Sprintf("Content from %s was filtered as low-quality", url),
		Type:       ErrorTypeLowQuality,
	}
}

// NewHTTPStatusError creates an error based on HTTP status code from target site
func NewHTTPStatusError(statusCode int, url string) *ScrapeError {
	var message string
	var errorType string

	switch {
	case statusCode == http.StatusBadRequest:
		message = fmt.Sprintf("Target site returned 400 Bad Request for %s - The server could not understand the request", url)
		errorType = ErrorTypeBadRequest
	case statusCode == http.StatusUnauthorized:
		message = fmt.Sprintf("Target site returned 401 Unauthorized for %s - Authentication required", url)
		errorType = ErrorTypeUnauthorized
	case statusCode == http.StatusForbidden:
		message = fmt.Sprintf("Target site returned 403 Forbidden for %s - Access denied (likely bot detection or rate limiting)", url)
		errorType = ErrorTypeForbidden
	case statusCode == http.StatusNotFound:
		message = fmt.Sprintf("Target site returned 404 Not Found for %s - The requested page does not exist", url)
		errorType = ErrorTypeNotFound
	case statusCode == http.StatusTooManyRequests:
		message = fmt.Sprintf("Target site returned 429 Too Many Requests for %s - Rate limit exceeded", url)
		errorType = ErrorTypeTooManyReqs
	case statusCode >= 500:
		message = fmt.Sprintf("Target site returned %d Server Error for %s", statusCode, url)
		errorType = ErrorTypeServerError
	default:
		message = fmt.Sprintf("Target site returned HTTP %d for %s", statusCode, url)
		errorType = ErrorTypeServerError
	}

	return &ScrapeError{
		StatusCode: statusCode,
		Message:    message,
		Type:       errorType,
	}
}
