-- Make the existing per-operator view-preferences table reachable via the Data API.
-- Mirrors the existing crm access pattern (authenticated full access; scoping done in server fns).
GRANT SELECT, INSERT, UPDATE, DELETE ON crm.user_view_preferences TO authenticated;
GRANT ALL ON crm.user_view_preferences TO service_role;

ALTER TABLE crm.user_view_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_user_view_prefs_access ON crm.user_view_preferences;
CREATE POLICY authenticated_user_view_prefs_access
  ON crm.user_view_preferences
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);