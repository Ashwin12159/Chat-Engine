import runQuery from "../database/runQuery";

export class BotService {
    // Get bot by inbox_id (inbox-level bot takes priority)
    static async getBotByInboxId(inboxId: string, tenantId: string): Promise<any> {
        // First, try to get inbox-level bot
        const inboxQuery = `
            SELECT b.* FROM bots b
            JOIN inboxes i ON b.inbox_id = i.id
            WHERE i.id = ? AND i.tenant_id = ? AND b.is_active = 1
            ORDER BY b.created_at DESC LIMIT 1
        `;
        const inboxResult = await runQuery(inboxQuery, [inboxId, tenantId]);
        if (inboxResult && (inboxResult.rows as any).length > 0) {
            return (inboxResult.rows as any)[0];
        }

        // Fallback: check if inbox has a bot_id configured
        const inboxBotQuery = `
            SELECT b.* FROM inboxes i
            JOIN bots b ON i.bot_id = b.id
            WHERE i.id = ? AND i.tenant_id = ? AND b.is_active = 1
            LIMIT 1
        `;
        const inboxBotResult = await runQuery(inboxBotQuery, [inboxId, tenantId]);
        if (inboxBotResult && (inboxBotResult.rows as any).length > 0) {
            return (inboxBotResult.rows as any)[0];
        }

        return null;
    }

    // Get bot by tenant_id (fallback for tenant-level bots)
    static async getBotByTenantId(tenantId: string): Promise<any> {
        const query = `
            SELECT * FROM bots 
            WHERE tenant_id = ? AND inbox_id IS NULL AND is_active = 1 
            ORDER BY created_at DESC LIMIT 1
        `;
        const result = await runQuery(query, [tenantId]);
        if (!result || (result.rows as any).length === 0) {
            return null;
        }
        const row = (result.rows as any)[0];
        return row;
    }
}
