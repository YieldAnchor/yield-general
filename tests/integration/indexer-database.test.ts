/**
 * Integration tier for indexer database projections and checkpoint resume.
 *
 * Re-exports the indexer integration suite so integration tests can be
 * referenced from the tests/integration directory as outlined in Issue #9.
 */
export * from '../../services/indexer/test/database-integration.test.js';
