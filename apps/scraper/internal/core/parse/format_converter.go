package parse

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// FormatConverter handles conversion from JSON to various output formats
type FormatConverter struct{}

// NewFormatConverter creates a new format converter
func NewFormatConverter() *FormatConverter {
	return &FormatConverter{}
}

// Convert converts JSON data to the requested output format
func (fc *FormatConverter) Convert(data interface{}, format string) (interface{}, error) {
	switch strings.ToLower(format) {
	case "json":
		return data, nil // Already JSON
	case "csv":
		return fc.toCSV(data)
	case "xml":
		return fc.toXML(data)
	case "yaml":
		return fc.toYAML(data)
	case "markdown":
		return fc.toMarkdown(data)
	default:
		return data, nil // Default to JSON
	}
}

// toCSV converts JSON array/object to CSV format
func (fc *FormatConverter) toCSV(data interface{}) (string, error) {
	switch v := data.(type) {
	case []interface{}:
		if len(v) == 0 {
			return "", nil
		}
		return fc.arrayToCSV(v)
	case map[string]interface{}:
		return fc.objectToCSV(v)
	default:
		return "", fmt.Errorf("unsupported data type for CSV conversion: %T", data)
	}
}

// arrayToCSV converts array of objects to CSV with headers
func (fc *FormatConverter) arrayToCSV(items []interface{}) (string, error) {
	if len(items) == 0 {
		return "", nil
	}

	// Extract headers from first item
	firstItem, ok := items[0].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("CSV conversion requires array of objects")
	}

	headers := fc.extractHeaders(firstItem)
	if len(headers) == 0 {
		return "", fmt.Errorf("no headers found in data")
	}

	var builder strings.Builder
	writer := csv.NewWriter(&builder)

	// Write headers
	if err := writer.Write(headers); err != nil {
		return "", fmt.Errorf("failed to write CSV headers: %w", err)
	}

	// Write data rows
	for _, item := range items {
		itemMap, ok := item.(map[string]interface{})
		if !ok {
			continue
		}

		row := make([]string, len(headers))
		for i, header := range headers {
			row[i] = fc.formatValue(itemMap[header])
		}

		if err := writer.Write(row); err != nil {
			return "", fmt.Errorf("failed to write CSV row: %w", err)
		}
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return "", fmt.Errorf("CSV writer error: %w", err)
	}

	return builder.String(), nil
}

// objectToCSV converts single object to CSV (headers + single row)
func (fc *FormatConverter) objectToCSV(item map[string]interface{}) (string, error) {
	headers := fc.extractHeaders(item)
	if len(headers) == 0 {
		return "", fmt.Errorf("no headers found in data")
	}

	var builder strings.Builder
	writer := csv.NewWriter(&builder)

	// Write headers
	if err := writer.Write(headers); err != nil {
		return "", fmt.Errorf("failed to write CSV headers: %w", err)
	}

	// Write data row
	row := make([]string, len(headers))
	for i, header := range headers {
		row[i] = fc.formatValue(item[header])
	}

	if err := writer.Write(row); err != nil {
		return "", fmt.Errorf("failed to write CSV row: %w", err)
	}

	writer.Flush()
	if err := writer.Error(); err != nil {
		return "", fmt.Errorf("CSV writer error: %w", err)
	}

	return builder.String(), nil
}

// extractHeaders extracts sorted header names from object
func (fc *FormatConverter) extractHeaders(item map[string]interface{}) []string {
	headers := make([]string, 0, len(item))
	for key := range item {
		headers = append(headers, key)
	}
	// Sort for consistent ordering
	// Note: For production, you might want a specific field order
	return headers
}

// formatValue converts any value to string for CSV
func (fc *FormatConverter) formatValue(value interface{}) string {
	if value == nil {
		return ""
	}

	switch v := value.(type) {
	case string:
		return v
	case float64:
		// Remove unnecessary decimals for whole numbers
		if v == float64(int64(v)) {
			return fmt.Sprintf("%d", int64(v))
		}
		return fmt.Sprintf("%v", v)
	case bool:
		if v {
			return "true"
		}
		return "false"
	case []interface{}:
		// Join array elements with semicolons
		parts := make([]string, len(v))
		for i, item := range v {
			parts[i] = fc.formatValue(item)
		}
		return strings.Join(parts, ";")
	case map[string]interface{}:
		// Nested object - convert to JSON string
		b, _ := json.Marshal(v)
		return string(b)
	default:
		return fmt.Sprintf("%v", v)
	}
}

// toXML converts JSON to basic XML format
func (fc *FormatConverter) toXML(data interface{}) (string, error) {
	var builder strings.Builder
	builder.WriteString("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n")

	switch v := data.(type) {
	case []interface{}:
		builder.WriteString("<items>\n")
		for _, item := range v {
			builder.WriteString("  <item>\n")
			if itemMap, ok := item.(map[string]interface{}); ok {
				fc.writeXMLFields(&builder, itemMap, 4)
			}
			builder.WriteString("  </item>\n")
		}
		builder.WriteString("</items>")
	case map[string]interface{}:
		builder.WriteString("<item>\n")
		fc.writeXMLFields(&builder, v, 2)
		builder.WriteString("</item>")
	default:
		return "", fmt.Errorf("unsupported data type for XML conversion: %T", data)
	}

	return builder.String(), nil
}

// writeXMLFields writes object fields as XML elements
func (fc *FormatConverter) writeXMLFields(builder *strings.Builder, item map[string]interface{}, indent int) {
	indentStr := strings.Repeat(" ", indent)
	for key, value := range item {
		// Sanitize key for XML tag
		xmlKey := strings.ReplaceAll(key, " ", "_")
		xmlKey = strings.ToLower(xmlKey)

		fmt.Fprintf(builder, "%s<%s>%s</%s>\n",
			indentStr, xmlKey, fc.xmlEscape(fc.formatValue(value)), xmlKey)
	}
}

// xmlEscape escapes special XML characters
func (fc *FormatConverter) xmlEscape(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	s = strings.ReplaceAll(s, "'", "&apos;")
	return s
}

// toYAML converts JSON to YAML format
func (fc *FormatConverter) toYAML(data interface{}) (string, error) {
	yamlBytes, err := yaml.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("failed to convert to YAML: %w", err)
	}
	return string(yamlBytes), nil
}

// toMarkdown converts JSON to Markdown format
func (fc *FormatConverter) toMarkdown(data interface{}) (string, error) {
	var builder strings.Builder

	switch v := data.(type) {
	case []interface{}:
		if len(v) == 0 {
			return "No data available.", nil
		}

		// Create markdown table for array of objects
		if firstItem, ok := v[0].(map[string]interface{}); ok {
			headers := fc.extractHeaders(firstItem)

			// Write table headers
			builder.WriteString("| ")
			builder.WriteString(strings.Join(headers, " | "))
			builder.WriteString(" |\n")

			// Write separator
			builder.WriteString("|")
			for range headers {
				builder.WriteString(" --- |")
			}
			builder.WriteString("\n")

			// Write rows
			for _, item := range v {
				if itemMap, ok := item.(map[string]interface{}); ok {
					builder.WriteString("| ")
					row := make([]string, len(headers))
					for i, header := range headers {
						row[i] = fc.markdownEscape(fc.formatValue(itemMap[header]))
					}
					builder.WriteString(strings.Join(row, " | "))
					builder.WriteString(" |\n")
				}
			}
		}

	case map[string]interface{}:
		// Single object - render as key-value list
		for key, value := range v {
			builder.WriteString(fmt.Sprintf("- **%s**: %s\n", key, fc.formatValue(value)))
		}

	default:
		return "", fmt.Errorf("unsupported data type for Markdown conversion: %T", data)
	}

	return builder.String(), nil
}

// markdownEscape escapes pipe characters for markdown tables
func (fc *FormatConverter) markdownEscape(s string) string {
	return strings.ReplaceAll(s, "|", "\\|")
}
