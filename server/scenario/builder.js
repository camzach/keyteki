// @ts-nocheck

/*
 * Builds a live Game from a validated scenario payload (see ./payload.js).
 *
 * The creator becomes player 1 (the active player); the opponent is an inert
 * placeholder with no socket, so scenarios should be solvable within one turn.
 */

const Game = require('../game/game.js');
const GiganticCard = require('../game/GiganticCard.js');
const cardClasses = require('../game/cards');
const Settings = require('../settings.js');
const logger = require('../log.js');
const { describeCondition } = require('./goal.js');
const { applySetupTest } = require('../../test/helpers/setupTest.js');
const { buildFlow, cardsByCode, deckBuilder } = require('./runner.js');

const OPPONENT_NAME = 'Puzzle Opponent';
const DEFAULT_EXPANSION = 341;

function normaliseInPlay(side) {
    return (side.inPlay || []).map((entry) =>
        typeof entry === 'string' ? { card: entry } : entry
    );
}

// The id of the other half when the label is one half of a gigantic creature.
function giganticPartnerId(label) {
    const { id } = deckBuilder.getCard(label);
    const cardClass = cardClasses[id];

    if (!cardClass || !(cardClass.prototype instanceof GiganticCard)) {
        return undefined;
    }

    return id.endsWith('2') ? id.slice(0, -1) : `${id}2`;
}

/**
 * Convert one side of a payload into `setupTest` options. Upgrades, purged
 * cards and the other halves of gigantic creatures have no setupTest zone, so
 * they are added to the deck and moved later.
 */
function toSetupOptions(side = {}) {
    const entries = normaliseInPlay(side);
    const upgrades = entries.flatMap((entry) => [
        ...(entry.upgrades || []),
        ...(entry.under || [])
    ]);
    const giganticPartners = entries
        .map((entry) => giganticPartnerId(entry.card))
        .filter((id) => id);

    return {
        house: side.house,
        amber: side.amber,
        chains: side.chains,
        keys: side.keys,
        token: side.token,
        inPlay: entries.map((entry) => entry.card),
        hand: side.hand,
        discard: side.discard,
        archives: side.archives,
        deck: [...(side.deck || []), ...upgrades, ...(side.purged || []), ...giganticPartners]
    };
}

// Mirrors the composition done by PutIntoPlayAction when a gigantic creature is played.
function composeGigantic(wrapper, card) {
    const player = wrapper.player;
    const part = player.deck.find((c) => c.id === card.compositeId);
    const oldTopOfDeck = player.deck[0];

    player.removeCardFromPile(part);
    card.composedPart = part;
    card.image = card.compositeImageId || card.id;
    player.checkDeckAfterCardMove(oldTopOfDeck);
}

function attachUpgrade(wrapper, upgradeLabel, parent) {
    const upgrade = wrapper.findCardByName(upgradeLabel, 'deck');
    const player = wrapper.player;
    const oldTopOfDeck = player.deck[0];

    player.removeCardFromPile(upgrade);
    upgrade.moveTo('play area');
    parent.upgrades.push(upgrade);
    upgrade.parent = parent;
    upgrade.updateEffectContexts();
    player.checkDeckAfterCardMove(oldTopOfDeck);
}

function placeUnder(wrapper, label, parent) {
    const card = wrapper.findCardByName(label, 'deck');
    const player = wrapper.player;
    const oldTopOfDeck = player.deck[0];

    player.removeCardFromPile(card);
    card.controller = parent.controller;
    card.parent = parent;
    card.moveTo('under');
    parent.childCards.push(card);
    card.updateEffectContexts();
    player.checkDeckAfterCardMove(oldTopOfDeck);
}

function applyBoardDetails(wrapper, side = {}) {
    const entries = normaliseInPlay(side);
    const cardsInPlay = wrapper.inPlay.slice();

    if (cardsInPlay.length !== entries.length) {
        throw new Error(
            `${wrapper.name}: expected ${entries.length} cards in play but found ${cardsInPlay.length}`
        );
    }

    entries.forEach((entry, index) => {
        const card = cardsInPlay[index];

        if (card.gigantic && !card.composedPart) {
            composeGigantic(wrapper, card);
        }

        // Token counts are absolute, so they replace any printed values (e.g. armor).
        for (const [type, count] of Object.entries(entry.tokens || {})) {
            card.setToken(type, count);
        }

        if (entry.damage) {
            card.damage = entry.damage;
        }

        if (entry.exhausted) {
            card.exhaust();
        }

        for (const upgrade of entry.upgrades || []) {
            attachUpgrade(wrapper, upgrade, card);
        }

        for (const under of entry.under || []) {
            placeUnder(wrapper, under, card);
        }
    });

    // First entry is the top of the pile, so walk in reverse.
    for (const label of [...(side.purged || [])].reverse()) {
        wrapper.moveCard(wrapper.findCardByName(label, 'deck'), 'purged');
    }

    const deckCards = wrapper.mixedListToCardList(side.deck, 'deck');
    for (const card of [...deckCards].reverse()) {
        wrapper.moveCard(card, 'deck');
    }

    // The test deck builder pads decks with filler; only the listed cards stay.
    for (const card of wrapper.player.deck.slice(deckCards.length)) {
        wrapper.player.removeCardFromPile(card);
    }
}

function resolveArg(arg, actor, other) {
    if (arg === null || typeof arg !== 'object') {
        return arg;
    }

    const location = arg.location || 'any';
    for (const [wrapper, side] of [
        [actor, undefined],
        [actor, 'opponent'],
        [other, undefined]
    ]) {
        try {
            return wrapper.findCardByName(arg.card, location, side);
        } catch (err) {
            // try the next candidate
        }
    }

    throw new Error(`Could not find card "${arg.card}"`);
}

function runActions(actions = [], wrappers) {
    actions.forEach((step, index) => {
        const actor = wrappers[step.player - 1];
        const other = wrappers[2 - step.player];

        try {
            const args = (step.args || []).map((arg) => resolveArg(arg, actor, other));
            actor[step.action](...args);
        } catch (err) {
            throw new Error(`Setup action ${index + 1} (${step.action}) failed: ${err.message}`);
        }
    });
}

function makeOpponent() {
    return {
        id: 'scenario-opponent',
        name: OPPONENT_NAME,
        user: Settings.getUserWithDefaultsSet({
            username: OPPONENT_NAME,
            settings: { optionSettings: { orderForcedAbilities: true } }
        })
    };
}

/**
 * @param {object} scenario - a validated scenario (see decodeScenario)
 * @param {object} options
 * @param {object} options.router - GameServer (or compatible) used as the Game's router
 * @param {object} options.details - start-game details; the owner is the creator
 * @param {object} [options.cardData] - card data lookup passed to the Game
 * @returns {import('../game/game')}
 */
function buildScenarioGame(scenario, { router, details, cardData = cardsByCode }) {
    const creator = Object.values(details.players).find(
        (player) => player.user.username === details.owner.username
    );
    if (!creator) {
        throw new Error('Scenario creator is not part of the game');
    }

    const creatorName = creator.user.username;
    const game = new Game(
        {
            ...details,
            allowSpectators: false,
            players: [creator, makeOpponent()],
            spectators: {}
        },
        { router, cardData }
    );
    game.started = true;
    game.startedAt = new Date();
    for (const player of game.getPlayers()) {
        game.setWins(player.name, 0);
    }

    const playerNames = [creatorName, OPPONENT_NAME];
    const flow = buildFlow(game, playerNames);
    const creatorPlayer = game.getPlayerByName(creatorName);

    // Scripted actions need to be able to pick the order of forced abilities.
    const previousOrderSetting = creatorPlayer.optionSettings.orderForcedAbilities;
    creatorPlayer.optionSettings.orderForcedAbilities = true;

    try {
        applySetupTest(
            {
                player1: toSetupOptions(scenario.player1),
                player2: toSetupOptions(scenario.player2)
            },
            {
                game,
                player1: flow.player1,
                player2: flow.player2,
                startGame: flow.startGame,
                keepCards: flow.keepCards,
                deckBuilder,
                cardRegistry: {},
                playerNames,
                prepareDeck: (deck, idx) => {
                    const side = scenario[idx === 0 ? 'player1' : 'player2'] || {};
                    deck.expansion = deck.expansion || DEFAULT_EXPANSION;
                    deck.uuid = deck.uuid || `scenario-${game.id}-${idx + 1}`;
                    if (side.houses && side.houses.length > 0) {
                        deck.houses = [...new Set([...side.houses, ...deck.houses])].slice(0, 3);
                    }
                }
            }
        );

        applyBoardDetails(flow.player1, scenario.player1);
        applyBoardDetails(flow.player2, scenario.player2);
        game.checkGameState(true);

        runActions(scenario.actions, flow.allPlayers);
    } finally {
        creatorPlayer.optionSettings.orderForcedAbilities = previousOrderSetting;
    }

    // The placeholder opponent never connects; marking it disconnected lets the
    // server clean the game up as soon as the creator leaves.
    game.getPlayerByName(OPPONENT_NAME).disconnectedAt = new Date(0);
    creatorPlayer.lastEventAt = Date.now();

    // Kept so the game can be rebuilt by the /restart chat command.
    game.puzzleScenario = scenario;
    game.puzzleDetails = details;
    // Without an explicit goal the puzzle is solved by forging a key.
    game.puzzleGoal = {
        playerNames,
        conditions: scenario.goal || [{ type: 'keys', count: creatorPlayer.getForgedKeys() + 1 }]
    };
    game.puzzle = {
        title: scenario.title,
        author: scenario.author,
        description: scenario.description
    };

    game.gameChat.messages = [];
    game.addAlert('info', `Puzzle: ${scenario.title || 'Untitled'}`);
    if (scenario.author) {
        game.addAlert('info', `Author: ${scenario.author}`);
    }
    if (scenario.description) {
        game.addAlert('info', `Objective: ${scenario.description}`);
    }
    // The objective already tells the player what to do; only spell the goal out without one.
    if (scenario.goal && !scenario.description) {
        game.addAlert(
            'info',
            `Goal: ${game.puzzleGoal.conditions.map(describeCondition).join('; ')}`
        );
    }

    logger.info(`Scenario game ${game.id} built for ${creatorName}`);

    return game;
}

module.exports = { OPPONENT_NAME, buildScenarioGame, toSetupOptions };
