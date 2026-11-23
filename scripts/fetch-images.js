/*eslint no-console:0 */
// Downloads card images from the card data into public/img/cards/<id>.png.
//
//   npm run images                 every card, skipping images already present
//   npm run images -- anger troll  only the given card ids
//   npm run images -- --force      download again even if the file exists
const fs = require('fs');
const path = require('path');

const PACKS = path.join(__dirname, '../master-vault-data/packs');
const OUTPUT = path.join(__dirname, '../public/img/cards');
const CONCURRENCY = 8;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = new Set(args.filter((arg) => !arg.startsWith('--')));

function loadImages() {
    const images = new Map();

    for (const file of fs.readdirSync(PACKS).filter((name) => name.endsWith('.json'))) {
        for (const card of JSON.parse(fs.readFileSync(path.join(PACKS, file), 'utf8')).cards) {
            if (card.image && !images.has(card.id) && (!only.size || only.has(card.id))) {
                images.set(card.id, card.image);
            }
        }
    }

    return images;
}

async function download(id, url) {
    // Matches the file name the client asks for (see client CardImage.jsx).
    const target = path.join(OUTPUT, `${id.replace(/\*/g, '_')}.png`);

    if (!force && fs.existsSync(target)) {
        return 'skipped';
    }

    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    await fs.promises.writeFile(target, Buffer.from(await response.arrayBuffer()));

    return 'downloaded';
}

async function main() {
    const images = loadImages();
    const queue = [...images];
    const counts = { downloaded: 0, skipped: 0, failed: 0 };

    if (only.size && images.size !== only.size) {
        const unknown = [...only].filter((id) => !images.has(id));
        console.warn(`Unknown card ids: ${unknown.join(', ')}`);
    }

    fs.mkdirSync(OUTPUT, { recursive: true });

    async function worker() {
        while (queue.length) {
            const [id, url] = queue.shift();

            try {
                counts[await download(id, url)]++;
            } catch (err) {
                counts.failed++;
                console.error(`${id}: ${err.message} (${url})`);
            }

            const done = counts.downloaded + counts.skipped + counts.failed;
            if (done % 100 === 0) {
                console.log(`${done}/${images.size}`);
            }
        }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    console.log(
        `Done: ${counts.downloaded} downloaded, ${counts.skipped} already present, ${counts.failed} failed`
    );
    process.exitCode = counts.failed ? 1 : 0;
}

main();
