// Handles visitor session logic for external chats
import runQuery from '../database/runQuery';

export interface Visitor {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone?: string;
  session_id: string;
  ip_address?: string;
  user_agent?: string;
  referrer_url?: string;
  created_at: Date;
  last_activity: Date;
  status: 'active' | 'waiting' | 'assigned' | 'ended';
}

export class VisitorService {
  static async initializeVisitorSession(
    tenantId: string,
    visitorData: {
      name?: string;
      email?: string;
      phone?: string;
      sessionId: string;
      ipAddress?: string;
      userAgent?: string;
      referrerUrl?: string;
    }
  ): Promise<Visitor> {
    const query = `
      INSERT INTO external_visitors 
      (id, tenant_id, name, email, phone, session_id, ip_address, user_agent, referrer_url, status)
      VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `;
    await runQuery(query, [
      tenantId,
      visitorData.name,
      visitorData.email || null,
      visitorData.phone || null,
      visitorData.sessionId,
      visitorData.ipAddress || null,
      visitorData.userAgent || null,
      visitorData.referrerUrl || null
    ]);
    const selectQuery = `
      SELECT * FROM external_visitors 
      WHERE tenant_id = ? AND session_id = ?
      ORDER BY created_at DESC LIMIT 1
    `;
    const result = await runQuery(selectQuery, [tenantId, visitorData.sessionId]);
    const visitor = (result.rows as Visitor[])[0];
    if (!visitor) throw new Error('Failed to create visitor session');
    return visitor;
  }

  static async updateVisitorActivity(tenantId: string, visitorId: string): Promise<void> {
    const query = `
      UPDATE external_visitors 
      SET last_activity = NOW() 
      WHERE tenant_id = ? AND id = ?
    `;
    await runQuery(query, [tenantId, visitorId]);
  }

  static async getTenantExternalStats(tenantId: string): Promise<{
    totalVisitors: number;
    activeConversations: number;
    queueLength: number;
  }> {
    const visitorsQuery = `
      SELECT COUNT(*) as count FROM external_visitors 
      WHERE tenant_id = ? AND DATE(created_at) = CURDATE()
    `;
    const activeQuery = `
      SELECT COUNT(*) as count FROM conversations 
      WHERE tenant_id = ? AND type = 'external' AND state = 'active'
    `;
    const queueQuery = `
      SELECT COUNT(*) as count FROM conversations 
      WHERE tenant_id = ? AND type = 'external' AND state = 'waiting'
    `;
    const [visitorsResult, activeResult, queueResult] = await Promise.all([
      runQuery(visitorsQuery, [tenantId]),
      runQuery(activeQuery, [tenantId]),
      runQuery(queueQuery, [tenantId]),
    ]);
    return {
      totalVisitors: parseInt((visitorsResult.rows as any[])[0]?.count || '0'),
      activeConversations: parseInt((activeResult.rows as any[])[0]?.count || '0'),
      queueLength: parseInt((queueResult.rows as any[])[0]?.count || '0'),
    };
  }
  // ...other visitor-related methods as needed...
}
