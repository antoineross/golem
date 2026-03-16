package parse

// contextKey is a custom type for context keys to avoid collisions
type contextKey string

// ContextKeyEinoTracer is the key used to store the Eino tracer in context
const ContextKeyEinoTracer contextKey = "eino_tracer"
