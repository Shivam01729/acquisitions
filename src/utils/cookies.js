export const cookies = {
    getOptions: () => {
        return {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Lax',
            maxAge: 15 * 60 * 1000,
        };
    },

    set: (res, name, value, options = {}) => {
        res.cookie(name, value, { 
            ...cookies.getOptions(), 
            ...options 
        });
    },

    clear: (res, name, options = {}) => {
        res.clearCookie(name, { 
            ...cookies.getOptions(), 
            ...options 
        });
    },

    get: (req, name) => {
        return req.cookies[name];
    }
};
