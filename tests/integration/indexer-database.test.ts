/**
 * Root integration tier for indexer database projections and checkpoint resume.
 *
 * Re-exports the indexer integration suite so the integration tests can be
 * discovered and run from the root test directory as specified in Issue #9.
 */
export * from '../../services/indexer/test/database-integration.test.js';
