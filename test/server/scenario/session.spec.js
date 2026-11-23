const { isValidToken, userFromToken } = require('../../../server/session.js');

describe('puzzle session tokens', function () {
    it('accepts random-looking url-safe tokens', function () {
        expect(isValidToken('abcdefghijklmnop')).toBe(true);
        expect(isValidToken('A-b_C-d_E-f_G-h_I-j_K')).toBe(true);
    });

    it('rejects tokens that are too short, too long or contain odd characters', function () {
        expect(isValidToken('short')).toBe(false);
        expect(isValidToken('a'.repeat(129))).toBe(false);
        expect(isValidToken('abcdefghijklmnop!')).toBe(false);
        expect(isValidToken('abcdefghijklmnop qrs')).toBe(false);
    });

    it('rejects things that are not strings', function () {
        expect(isValidToken(undefined)).toBe(false);
        expect(isValidToken(null)).toBe(false);
        expect(isValidToken(12345678901234567890)).toBe(false);
        expect(isValidToken({})).toBe(false);
    });

    it('derives a stable guest name that does not reveal the token', function () {
        const token = 'secret-token-0123456789';
        const user = userFromToken(token);

        expect(user.username).toMatch(/^Guest-[0-9a-f]{6}$/);
        expect(userFromToken(token).username).toBe(user.username);
        expect(userFromToken('another-token-0123456789').username).not.toBe(user.username);
        expect(user.username).not.toContain('secret');
    });

    it('gives the user default settings', function () {
        const user = userFromToken('secret-token-0123456789');

        expect(user.settings).toBeDefined();
        expect(user.settings.optionSettings).toBeDefined();
    });

    it('returns no user for an invalid token', function () {
        expect(userFromToken('nope')).toBeUndefined();
        expect(userFromToken(undefined)).toBeUndefined();
    });
});
