# Scrape Package

This package handles web scraping operations with proper error handling and status codes.

## Architecture

### Files

- **`service.go`** - Core scraping logic, orchestrates scraping with different strategies
- **`handler.go`** - HTTP handler, maps service errors to appropriate HTTP status codes
- **`errors.go`** - Typed error definitions with proper HTTP status codes
- **`robots.go`** - Robots.txt handling
- **`strategies.go`** - Header strategies for bot evasion

### Error Handling

All errors are defined as typed `ScrapeError` structs in `errors.go`. This ensures:

1. **Consistent status codes** - Each error type has a defined HTTP status
2. **Better type safety** - Compile-time checking instead of string matching
3. **Centralized definitions** - All error responses in one place
4. **Easier maintenance** - Change error messages without touching handlers

#### Error Types

| Error Constructor | Status Code | Use Case |
|-------------------|-------------|----------|
| `NewBadRequestError()` | 400 | Invalid parameters, malformed URLs |
| `NewUnauthorizedError()` | 401 | Authentication required |
| `NewForbiddenError()` | 403 | Access denied, bot detection |
| `NewNotFoundError()` | 404 | Page doesn't exist |
| `NewTimeoutError()` | 408 | Request timeout |
| `NewTooManyRequestsError()` | 429 | Rate limiting |
| `NewServerError()` | 500+ | Target site errors |
| `NewRobotsBlockedError()` | 403 | Blocked by robots.txt |
| `NewLowQualityContentError()` | 422 | Content filtered |
| `NewHTTPStatusError()` | varies | Based on target site status |

#### Usage Example

```go
// In service.go
if status >= 400 {
    return nil, NewHTTPStatusError(status, params.Url)
}

if !s.robots.IsAllowed(params.Url, "SupacrawlerBot") {
    return nil, NewRobotsBlockedError(params.Url)
}
```

```go
// In handler.go - automatically maps to correct HTTP status
result, err := h.service.ScrapeURL(c.Context(), p)
if err != nil {
    if scrapeErr, ok := err.(*ScrapeError); ok {
        return c.Status(scrapeErr.StatusCode).JSON(engineapi.Error{
            Success: &[]bool{false}[0],
            Error:   &err.Error(),
        })
    }
    // fallback for unknown errors
    return c.Status(500).JSON(...)
}
```

## Adding New Error Types

1. Add error constructor to `errors.go`:
```go
func NewMyCustomError(message string) *ScrapeError {
    return &ScrapeError{
        StatusCode: http.StatusTeapot,
        Message:    message,
        Type:       "my_custom_error",
    }
}
```

2. Use in `service.go`:
```go
if someCondition {
    return nil, NewMyCustomError("something went wrong")
}
```

3. Handler automatically maps it to correct status code!

## Best Practices

1. **Always use typed errors** from `errors.go`, not `fmt.Errorf()`
2. **Let the handler handle HTTP status** - service returns typed errors, handler maps to HTTP
3. **Keep error messages user-friendly** - they're returned to API clients
4. **Add error type constants** for categorization if needed
