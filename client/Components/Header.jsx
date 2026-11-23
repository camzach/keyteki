import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Button } from '@heroui/react';

import { gameSendMessage, leaveGameRequested } from '../redux/socketActions';

const Header = () => {
    const dispatch = useDispatch();
    const currentGame = useSelector((state) => state.lobby.currentGame);
    const connected = useSelector((state) => state.lobby.connected);
    const inGame = !!currentGame?.started;

    return (
        <nav className='fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2 border-b border-border/70 bg-overlay/95 px-4'>
            <span className='mr-auto font-semibold'>
                Keyteki Puzzles{inGame && currentGame.name ? ` - ${currentGame.name}` : ''}
            </span>
            {!connected && <span className='text-sm text-muted'>Connecting...</span>}
            {inGame && (
                <>
                    <Button
                        variant='light'
                        onPress={() => dispatch(gameSendMessage('chat', '/restart'))}
                    >
                        Restart
                    </Button>
                    <Button variant='light' onPress={() => dispatch(leaveGameRequested())}>
                        Leave Puzzle
                    </Button>
                </>
            )}
        </nav>
    );
};

Header.displayName = 'Header';

export default Header;
