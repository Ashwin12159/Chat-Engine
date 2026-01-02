import { Response } from 'express';
const sendHTTPResponse = {
    success: (res: Response, statusCode: number = 200, message: string, data?: any) => {
        res.status(statusCode).json({
            status: 'success',
            message,
            data: data || null
        });
    },
    error: (res: Response, statusCode: number, message: string, errorDetails?: any) => {
        res.status(statusCode || 500).json({
            status: 'error',
            message,
            error: errorDetails || null
        });
    }
}

export default sendHTTPResponse;