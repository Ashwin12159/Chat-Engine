import runQuery from '../database/runQuery';
import bcrypt from 'bcrypt';

export interface User {
  id: string;
  name: string;
  tenant_id: string;
  email: string;
  password_hash: string;
  is_online: boolean;
  last_seen: Date;
  created_at: Date;
}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
}

export class UserService {
  static async createUser(userData: CreateUserData): Promise<User> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    const query = `
      INSERT INTO users (id, name, email, password_hash)
      VALUES (UUID(), ?, ?, ?)
    `;

    await runQuery(query, [
      userData.name,
      userData.email,
      hashedPassword
    ]);

    // Get the created user
    const selectQuery = 'SELECT * FROM users WHERE email = ? ORDER BY created_at DESC LIMIT 1';
    const result = await runQuery(selectQuery, [userData.email]);

    const user = (result.rows as User[])[0];
    if (!user) {
      throw new Error('Failed to create user');
    }
    return user;
  }

  static async findUserByEmail(email: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE email = ?';
    const result = await runQuery(query, [email]);
    return (result.rows as User[])[0] || null;
  }

  static async findUserById(id: string): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = ?';
    const result = await runQuery(query, [id]);
    return (result.rows as User[])[0] || null;
  }

  static async verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const query = `
      UPDATE users 
      SET password_hash = ?
      WHERE id = ?
    `;
    await runQuery(query, [hashedPassword, userId]);
  }

  static async updateOnlineStatus(userId: string, tenantId: string, isOnline: boolean): Promise<void> {
    const query = `
      UPDATE users 
      SET is_online = ?, last_seen = NOW()
      WHERE id = ? AND tenant_id = ?
    `;
    await runQuery(query, [isOnline, userId, tenantId]);
  }

  static async getOnlineUsers(tenantId: string): Promise<User[]> {
    const query = 'SELECT * FROM users WHERE is_online = TRUE AND tenant_id = ?';
    const result = await runQuery(query, [tenantId]);
    return result.rows as User[];
  }

  static async searchUsers(searchTerm: string, currentUserId: string): Promise<User[]> {
    const query = `
      SELECT id, name, email, is_online, last_seen
      FROM users 
      WHERE (name LIKE ? OR email LIKE ?) 
        AND id != ?
      LIMIT 20
    `;
    const result = await runQuery(query, [`%${searchTerm}%`, `%${searchTerm}%`, currentUserId]);
    return result.rows as User[];
  }
}
