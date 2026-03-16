package adk

import "unicode/utf8"

// truncateUTF8 truncates s to at most maxRunes runes without splitting
// multi-byte characters. Returns the original string if it is shorter.
func truncateUTF8(s string, maxRunes int) string {
	if maxRunes <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= maxRunes {
		return s
	}
	runes := []rune(s)
	return string(runes[:maxRunes])
}
