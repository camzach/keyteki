const STORAGE_KEY = 'puzzle-session-token';

const randomToken = () => {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);

    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * The throwaway token that identifies this browser session to the server.
 * It is generated here, kept in sessionStorage and never leaves the client
 * except in the socket handshake.
 */
export const getSessionToken = () => {
    let token = window.sessionStorage.getItem(STORAGE_KEY);

    if (!token) {
        token = randomToken();
        window.sessionStorage.setItem(STORAGE_KEY, token);
    }

    return token;
};
