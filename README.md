# Keyteki Puzzles

A barebones server and client for playing [KeyForge](https://keyforging.com/) puzzles in the browser.
Paste a puzzle code, and the server builds the board exactly as described and drops you into it.
No accounts: your browser generates a throwaway session token.

```bash
npm ci
npm start    # http://localhost:4000
```

-   [Local Development](docs/local-development.md) - running, sessions, the puzzle code format and exporting puzzles
-   [Docs](docs/README.md) - card implementation and game engine references

Keyteki is a fork of the [ringteki sourcecode](https://github.com/ringteki/ringteki).
