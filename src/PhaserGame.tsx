import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';
import StartGame from './game/main';
import { EventBus } from './game/EventBus';

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
		if (game.current === null)
		{

			game.current = StartGame("game-container");

			if (typeof ref === 'function')
			{
				ref({ game: game.current, scene: null });
			} else if (ref)
			{
				ref.current = { game: game.current, scene: null };
			}
		}

		return () =>
		{
			if (game.current)
			{
				game.current.destroy(true);
				if (game.current !== null)
				{
					game.current = null;
				}
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
