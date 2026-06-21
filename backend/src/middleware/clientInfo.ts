import { Request, Response, NextFunction } from "express";

export interface ClientInfoRequest extends Request {
  clientInfo?: {
    userAgent?: string;
    ipAddress?: string;
  };
}

/**
 * Middleware to extract client information (user agent and IP address)
 */
export const extractClientInfo = (req: ClientInfoRequest, res: Response, next: NextFunction) => {
  const userAgent = req.headers['user-agent'];
  let ipAddress: string | undefined;

  // Try to get IP address from various headers
  const forwarded = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const clientIp = req.headers['x-client-ip'];
  
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs, take the first one
    ipAddress = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  } else if (realIp) {
    ipAddress = Array.isArray(realIp) ? realIp[0] : realIp;
  } else if (clientIp) {
    ipAddress = Array.isArray(clientIp) ? clientIp[0] : clientIp;
  } else {
    // Fallback to connection remote address
    ipAddress = req.connection?.remoteAddress || 
                req.socket?.remoteAddress || 
                (req.connection as any)?.socket?.remoteAddress;
  }

  // Clean up IPv6-mapped IPv4 addresses
  if (ipAddress && ipAddress.startsWith('::ffff:')) {
    ipAddress = ipAddress.substring(7);
  }

  req.clientInfo = {
    userAgent: userAgent ? String(userAgent) : undefined,
    ipAddress: ipAddress || undefined
  };

  next();
};

export default extractClientInfo;
