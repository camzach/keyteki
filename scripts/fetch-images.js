/*eslint no-console:0 */
// Downloads card images from the card data into public/img/cards/<id>.png, then
// builds <id>-complete.png for each gigantic creature from its two halves.
//
//   npm run images                 every card, skipping images already present
//   npm run images -- anger troll  only the given card ids
//   npm run images -- --force      download again even if the file exists
const fs = require('fs');
const path = require('path');
const { fabric } = require('fabric');

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

// Ids of the half of each gigantic creature that has no trailing "2"; the composite
// image is named after it (see GiganticCard.compositeImageId).
function giganticIds() {
    const GiganticCard = require('../server/game/GiganticCard.js');
    const cards = require('../server/game/cards');

    return Object.entries(cards)
        .filter(([id, card]) => card.prototype instanceof GiganticCard && !id.endsWith('2'))
        .map(([id]) => id);
}

function loadImage(file) {
    return new Promise((resolve) => {
        fabric.Image.fromURL(`file://${file}`, (image) => resolve(image));
    });
}

// Stacks the halves on a card-sized canvas, each rotated a quarter turn
// counter-clockwise, with the "2" half on top.
async function buildGigantic(id) {
    const target = path.join(OUTPUT, `${id}-complete.png`);
    const bottomFile = path.join(OUTPUT, `${id}.png`);
    const topFile = path.join(OUTPUT, `${id}2.png`);

    if (!force && fs.existsSync(target)) {
        return 'skipped';
    }

    if (!fs.existsSync(bottomFile) || !fs.existsSync(topFile)) {
        throw new Error('missing a half image');
    }

    const canvas = new fabric.StaticCanvas(null, { width: 300, height: 420 });
    const top = await loadImage(topFile);
    const bottom = await loadImage(bottomFile);
    top.rotate(-90).scaleToWidth(300).set({ top: 210, left: 0 });
    bottom.rotate(-90).scaleToWidth(300).set({ top: 420, left: 0 });
    canvas.add(top, bottom);
    canvas.renderAll();

    const data = canvas.toDataURL({ format: 'png' }).replace(/^data:image\/png;base64,/, '');
    await fs.promises.writeFile(target, Buffer.from(data, 'base64'));
    canvas.dispose();

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

    for (const id of giganticIds()) {
        if (only.size && !only.has(id) && !only.has(`${id}2`)) {
            continue;
        }

        try {
            counts[await buildGigantic(id)]++;
        } catch (err) {
            counts.failed++;
            console.error(`${id}-complete: ${err.message}`);
        }
    }

    console.log(
        `Done: ${counts.downloaded} downloaded, ${counts.skipped} already present, ${counts.failed} failed`
    );
    process.exitCode = counts.failed ? 1 : 0;
}

main();
