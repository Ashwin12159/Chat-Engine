import { RowDataPacket } from "mysql2";
import { pool } from "../config/database";
import logger from "../config/logger";

const runQuery = async <T extends RowDataPacket[]>(
  query: string,
  params?: any[]
): Promise<{ rows: T }> => {
  try {
    const [rows] = await pool.execute(query, params);
    return { rows: rows as T };
  } catch (error: any) {
    logger.error(`Database query error: ${error?.message || error}`);
    throw error;
  }
};
export default runQuery;
