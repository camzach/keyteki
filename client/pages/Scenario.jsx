import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Button, TextArea } from '@heroui/react';

import AlertPanel from '../Components/Site/AlertPanel';
import Panel from '../Components/Site/Panel';
import { decodeScenarioCode, summarizeScenario } from '../scenario/payload';
import { lobbyActions } from '../redux/slices/lobbySlice';
import { sendMessage } from '../redux/socketActions';

const PlayerSummary = ({ title, summary }) => (
    <div className='min-w-0 flex-1'>
        <h4 className='mb-1 font-semibold'>{title}</h4>
        <ul className='list-disc pl-5 text-sm'>
            {summary.house && <li>Starting house: {summary.house}</li>}
            {summary.houses.length > 0 && <li>Houses: {summary.houses.join(', ')}</li>}
            <li>Amber: {summary.amber}</li>
            {summary.keys.length > 0 && <li>Forged keys: {summary.keys.join(', ')}</li>}
            {summary.chains > 0 && <li>Chains: {summary.chains}</li>}
            <li>
                In play:{' '}
                {summary.inPlay.length === 0
                    ? 'nothing'
                    : summary.inPlay.map((entry, index) => (
                          <span key={index}>
                              {index > 0 && ', '}
                              {entry.card}
                              {entry.details.length > 0 && ` (${entry.details.join('; ')})`}
                          </span>
                      ))}
            </li>
            <li>Hand: {summary.hand.length > 0 ? summary.hand.join(', ') : 'empty'}</li>
            <li>
                Deck {summary.deckCount}, discard {summary.discardCount}, purged{' '}
                {summary.purgedCount}, archives {summary.archivesCount}
            </li>
        </ul>
    </div>
);

PlayerSummary.displayName = 'PlayerSummary';

const Scenario = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const currentGame = useSelector((state) => state.lobby.currentGame);
    const gameError = useSelector((state) => state.lobby.gameError);
    const connected = useSelector((state) => state.lobby.connected);

    const [code, setCode] = useState('');
    const [isLaunching, setIsLaunching] = useState(false);

    const { summary, error } = useMemo(() => {
        if (code.trim().length === 0) {
            return {};
        }

        try {
            return { summary: summarizeScenario(decodeScenarioCode(code)) };
        } catch (err) {
            return { error: err.message };
        }
    }, [code]);

    useEffect(() => {
        if (currentGame?.started) {
            navigate('/play', { replace: true });
        }
    }, [currentGame, navigate]);

    useEffect(() => {
        if (gameError) {
            setIsLaunching(false);
        }
    }, [gameError]);

    useEffect(() => () => dispatch(lobbyActions.clearGameError()), [dispatch]);

    const launch = () => {
        setIsLaunching(true);
        dispatch(lobbyActions.clearGameError());
        dispatch(sendMessage('createscenariogame', code.trim()));
    };

    return (
        <div className='mx-auto w-full max-w-5xl'>
            <Panel title='Scenario'>
                <p className='mb-2 text-sm'>
                    Paste a scenario code to start a puzzle with a pre-built board. The code is a
                    base64 (or URL-safe base64) encoded scenario.
                </p>
                <TextArea
                    className='w-full font-mono text-xs'
                    rows={5}
                    value={code}
                    placeholder='Paste a scenario code'
                    onChange={(event) => setCode(event.target.value)}
                />

                {error && <AlertPanel type='warning' className='mt-3' message={error} />}
                {gameError && <AlertPanel type='danger' className='mt-3' message={gameError} />}

                {summary && (
                    <div className='mt-3'>
                        <h3 className='text-lg font-semibold'>
                            {summary.title || 'Untitled puzzle'}
                        </h3>
                        {summary.author && <div className='text-sm'>by {summary.author}</div>}
                        {summary.description && (
                            <p className='mt-1 text-sm'>Objective: {summary.description}</p>
                        )}
                        <p className='mt-1 text-sm'>
                            Goal:{' '}
                            {summary.goal.length > 0
                                ? summary.goal.join('; ')
                                : 'forge a key beyond those already forged'}
                        </p>
                        {summary.actionCount > 0 && (
                            <p className='mt-1 text-sm'>
                                {summary.actionCount} scripted setup action(s) will run before the
                                puzzle begins.
                            </p>
                        )}
                        <div className='mt-2 flex flex-col gap-4 md:flex-row'>
                            <PlayerSummary title='You' summary={summary.player1} />
                            <PlayerSummary title='Opponent' summary={summary.player2} />
                        </div>
                    </div>
                )}

                <div className='mt-3 text-center'>
                    <Button
                        type='button'
                        variant='primary'
                        isDisabled={!summary || !connected}
                        isPending={isLaunching}
                        onClick={launch}
                    >
                        Launch Scenario
                    </Button>
                </div>
            </Panel>
        </div>
    );
};

Scenario.displayName = 'Scenario';

export default Scenario;
