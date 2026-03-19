import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame from './game/main';
import { EventBus } from './game/EventBus';

let sharedGame: Phaser.Game | null = null;
let pendingDestroyTimer: number | null = null;
let mountedPhaserHosts = 0;

export interface IRefPhaserGame
{
	game: Phaser.Game | null;
	scene: Phaser.Scene | null;
}

export interface IProps
{
	currentActiveScene?: (scene_instance: Phaser.Scene) => void
}

export const PhaserGame = forwardRef<IRefPhaserGame, IProps>(function PhaserGame({ currentActiveScene }, ref)
{
	const game = useRef<Phaser.Game | null>(null!);
	const [_scene, setScene] = useState<Phaser.Scene | null>(null);

	useLayoutEffect(() =>
	{
		mountedPhaserHosts++;

		if (pendingDestroyTimer !== null)
		{
			window.clearTimeout(pendingDestroyTimer);
			pendingDestroyTimer = null;
		}

		if (sharedGame === null)
		{
			sharedGame = StartGame("game-container");
		}

		game.current = sharedGame;

		if (typeof ref === 'function')
		{
			ref({ game: game.current, scene: null });
		} else if (ref)
		{
			ref.current = { game: game.current, scene: null };
		}

		return () =>
		{
			mountedPhaserHosts = Math.max(0, mountedPhaserHosts - 1);
			const gameToDestroy = game.current;
			game.current = null;

			if (mountedPhaserHosts === 0 && gameToDestroy)
			{
				pendingDestroyTimer = window.setTimeout(() =>
				{
					if (mountedPhaserHosts === 0 && sharedGame === gameToDestroy)
					{
						sharedGame.destroy(true);
						sharedGame = null;
					}
					pendingDestroyTimer = null;
				}, 0);
			}
		}
	}, [ref]);

	useEffect(() =>
	{
		EventBus.on('current-scene-ready', (scene_instance: Phaser.Scene) =>
		{
			// console.log('scene_instance', scene_instance.scene);
			if (currentActiveScene && typeof currentActiveScene === 'function')
			{

				currentActiveScene(scene_instance);
				setScene(scene_instance);
			}

			if (typeof ref === 'function')
			{
				ref({ game: game.current, scene: scene_instance });
			} else if (ref)
			{
				ref.current = { game: game.current, scene: scene_instance };
			}
				
		});
		return () =>
		{
			EventBus.removeListener('current-scene-ready');
		}
	}, [currentActiveScene, ref]);

	return (
		<>
			<div id="game-container"></div>
		</>
	);

});
