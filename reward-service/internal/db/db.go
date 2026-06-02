package db

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQL string

// Connect creates a pgx connection pool and applies the schema (idempotent).
func Connect(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxpool.New: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("db ping: %w", err)
	}
	if _, err := pool.Exec(ctx, schemaSQL); err != nil {
		pool.Close()
		return nil, fmt.Errorf("apply schema: %w", err)
	}
	return pool, nil
}

// ActiveRoundID returns the ID of the current open round (ended_at IS NULL).
// Returns an error if no active round exists (should not happen after Connect).
func ActiveRoundID(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	var id int64
	err := pool.QueryRow(ctx,
		`SELECT id FROM rounds WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1`,
	).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("active round id: %w", err)
	}
	return id, nil
}
