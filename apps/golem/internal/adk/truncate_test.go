package adk

import "testing"

func TestTruncateUTF8_ShortString(t *testing.T) {
	s := "hello"
	result := truncateUTF8(s, 10)
	if result != "hello" {
		t.Errorf("expected %q, got %q", "hello", result)
	}
}

func TestTruncateUTF8_ExactLength(t *testing.T) {
	s := "hello"
	result := truncateUTF8(s, 5)
	if result != "hello" {
		t.Errorf("expected %q, got %q", "hello", result)
	}
}

func TestTruncateUTF8_Truncates(t *testing.T) {
	s := "hello world"
	result := truncateUTF8(s, 5)
	if result != "hello" {
		t.Errorf("expected %q, got %q", "hello", result)
	}
}

func TestTruncateUTF8_MultibyteRunes(t *testing.T) {
	s := "\u00e9\u00e8\u00ea\u00eb\u00e0" // eeeea (5 multi-byte runes)
	result := truncateUTF8(s, 3)
	expected := "\u00e9\u00e8\u00ea"
	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestTruncateUTF8_CJK(t *testing.T) {
	s := "\u4f60\u597d\u4e16\u754c" // 4 CJK characters (3 bytes each)
	result := truncateUTF8(s, 2)
	expected := "\u4f60\u597d"
	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestTruncateUTF8_Emoji(t *testing.T) {
	s := "\U0001f600\U0001f601\U0001f602" // 3 emojis (4 bytes each)
	result := truncateUTF8(s, 2)
	expected := "\U0001f600\U0001f601"
	if result != expected {
		t.Errorf("expected %q, got %q", expected, result)
	}
}

func TestTruncateUTF8_Empty(t *testing.T) {
	result := truncateUTF8("", 10)
	if result != "" {
		t.Errorf("expected empty string, got %q", result)
	}
}

func TestTruncateUTF8_ZeroMax(t *testing.T) {
	result := truncateUTF8("hello", 0)
	if result != "" {
		t.Errorf("expected empty string, got %q", result)
	}
}
