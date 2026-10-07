-- Auth deletion cascades execute as the restricted auth administrator, which
-- cannot query application tables or call the consistency helper directly.
-- These fixed-body trigger functions use only OLD/NEW parent identifiers,
-- retain an empty search_path, and expose no callable RPC entry point.
alter function budget_tracker.lock_item_parent() security definer;
alter function budget_tracker.enforce_transaction_items() security definer;
revoke all on function budget_tracker.lock_item_parent(), budget_tracker.enforce_transaction_items() from public, anon;
