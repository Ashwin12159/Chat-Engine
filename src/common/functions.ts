import runQuery from "../database/runQuery";

// check tenant feature enabled
export const isFeatureEnabled = async (tenantId: string, feature: string): Promise<boolean> => {
  const query = `
    SELECT COUNT(*) as feature_count FROM tenant_features
    WHERE tenant_id = ? AND feature_name = ? AND is_enabled = 1
  `;
  const result = await runQuery(query, [tenantId, feature]);
  const row = (result.rows as any)[0];
  return row.feature_count > 0;
}