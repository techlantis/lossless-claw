package main

import (
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadContextItemsUsesMessagePartsForEmptyMessageContent(t *testing.T) {
	t.Parallel()

	dbPath := setupContextItemsTestDB(t)
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		INSERT INTO conversations (conversation_id, session_id, session_key)
		VALUES (7, 'session-context', NULL);

		INSERT INTO messages (message_id, conversation_id, seq, role, content, token_count, created_at)
		VALUES (101, 7, 1, 'assistant', '', 120, '2026-05-14 22:00:00');

		INSERT INTO message_parts (part_id, message_id, session_id, part_type, ordinal, tool_name, tool_input)
		VALUES ('part-101', 101, 'session-context', 'tool', 0, 'supabase.execute_sql',
			'{"query":"select name from companies where status = ''active''"}');

		INSERT INTO context_items (conversation_id, ordinal, item_type, message_id, summary_id, created_at)
		VALUES (7, 0, 'message', 101, NULL, '2026-05-14 22:00:00');
	`); err != nil {
		t.Fatalf("seed context item: %v", err)
	}

	items, err := loadContextItems(dbPath, "session-context")
	if err != nil {
		t.Fatalf("load context items: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("item count = %d, want 1", len(items))
	}

	got := items[0]
	if got.preview == "" {
		t.Fatalf("expected non-empty preview for structured message part")
	}
	if !strings.Contains(got.content, "select name from companies") {
		t.Fatalf("expected rehydrated tool input in content, got %q", got.content)
	}
	if !strings.Contains(got.preview, "Tool input") {
		t.Fatalf("expected labeled tool input in preview, got %q", got.preview)
	}
}

func setupContextItemsTestDB(t *testing.T) string {
	t.Helper()

	dbPath := filepath.Join(t.TempDir(), "lcm.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open sqlite db: %v", err)
	}
	defer db.Close()

	if _, err := db.Exec(`
		CREATE TABLE conversations (
			conversation_id INTEGER PRIMARY KEY,
			session_id TEXT NOT NULL,
			session_key TEXT
		);
		CREATE TABLE messages (
			message_id INTEGER PRIMARY KEY AUTOINCREMENT,
			conversation_id INTEGER NOT NULL,
			seq INTEGER,
			role TEXT,
			content TEXT,
			token_count INTEGER,
			created_at TEXT
		);
		CREATE TABLE summaries (
			summary_id TEXT PRIMARY KEY,
			conversation_id INTEGER NOT NULL,
			kind TEXT,
			depth INTEGER,
			content TEXT,
			token_count INTEGER,
			created_at TEXT
		);
		CREATE TABLE context_items (
			conversation_id INTEGER NOT NULL,
			ordinal INTEGER NOT NULL,
			item_type TEXT NOT NULL,
			message_id INTEGER,
			summary_id TEXT,
			created_at TEXT
		);
		CREATE TABLE message_parts (
			part_id TEXT PRIMARY KEY,
			message_id INTEGER NOT NULL,
			session_id TEXT NOT NULL,
			part_type TEXT NOT NULL,
			ordinal INTEGER NOT NULL,
			text_content TEXT,
			tool_name TEXT,
			tool_input TEXT,
			tool_output TEXT,
			metadata TEXT
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	return dbPath
}
