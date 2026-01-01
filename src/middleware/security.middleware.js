import aj from '#config/arcjet.js';
import logger from '#config/logger.js';
import { slidingWindow } from '@arcjet/node';

const securityMiddleware = async (req, res, next) => {
    try {
        const role = req.user?.role || 'guest';
        let limit;
        let message;

        switch (role) {
            case 'admin':
                limit = 20;
                message = 'Admin rate limit exceeded(20 per min). slow down.';
                break;
            case 'user':
                limit = 10;
                message = 'User rate limit exceeded(10 per min). slow down.';
                break;
            case 'guest':
                limit = 5;
                message = 'Guest rate limit exceeded(5 per min). slow down.';
                break;
        }

        const client = aj.withRule(slidingWindow({
            mode: "LIVE",
            interval: '1m',
            max: limit,
            name: `${role}-rate-limit`,
        }));

        const decision = await client.protect(req);

        if (decision.isDenied() && decision.reason.isBot()) {
            logger.warn('Bot request blocked', { ip: req.ip, userAgent: req.get('User-Agent'), path: req.path });
            return res.status(403).json({ error: 'Access denied for bots', message: 'Your request has been identified as coming from a bot and has been blocked.' });
        }

        if (decision.isDenied() && decision.reason.isShield()) {
            logger.warn('Shield request blocked', { ip: req.ip, userAgent: req.get('User-Agent'), path: req.path, method: req.method });
            return res.status(403).json({ error: 'Access denied for bots', message: 'Request blocked by Shield.' });
        }

        if (decision.isDenied() && decision.reason.isRateLimit()) {
            logger.warn('Rate limit request blocked', { ip: req.ip, userAgent: req.get('User-Agent'), path: req.path, method: req.method });
            return res.status(429).json({ error: 'Rate limit exceeded', message });
        }

        next();
    } catch (error) {
        console.error('Security middleware error:', error);
        res.status(500).json({ error: 'Internal server error', message: 'An error occurred while processing your request.' });
    }
};

export default securityMiddleware;
