/**
 * Generic helpers for starting/stopping Spine animations on a given track.
 * Backward-compatible with existing calls and extended with option-based APIs.
 */
export interface StartAnimationOptions {
	animationName: string | string[];
	trackIndex?: number;
	loop?: boolean;
	timeScale?: number;
	fallbackAnimationName?: string | string[];
	fallbackToFirstAvailable?: boolean;
	logWhenMissing?: boolean;
}

export interface QueueAnimationOptions {
	animationName: string | string[];
	trackIndex?: number;
	loop?: boolean;
	delay?: number;
	timeScale?: number;
	fallbackAnimationName?: string | string[];
	fallbackToFirstAvailable?: boolean;
	logWhenMissing?: boolean;
}

export interface StopAnimationOptions {
	fadeOut?: number;
	trackIndex?: number;
	clearAllTracks?: boolean;
}

export interface StartAnimationResult {
	animationName: string;
	entry: any;
}

function toAnimationCandidates(name: string | string[] | undefined): string[] {
	if (!name) return [];
	const arr = Array.isArray(name) ? name : [name];
	return arr.map((n) => String(n).trim()).filter((n) => n.length > 0);
}

function getAnimationState(spine: any): any | null {
	const state = spine?.animationState;
	if (!state) return null;
	if (typeof state.setAnimation !== 'function') return null;
	return state;
}

export function getAvailableAnimations(spine: any): string[] {
	const candidates = [
		spine?.skeleton?.data?.animations,
		spine?.skeletonData?.animations,
		spine?.animationState?.data?.skeletonData?.animations
	];

	for (const source of candidates) {
		if (!Array.isArray(source) || source.length === 0) continue;
		return source
			.map((anim: any) => {
				if (typeof anim === 'string') return anim;
				return String(anim?.name ?? '').trim();
			})
			.filter((name: string) => name.length > 0);
	}

	return [];
}

export function resolveAnimationName(
	spine: any,
	animationName: string | string[],
	options?: {
		fallbackAnimationName?: string | string[];
		fallbackToFirstAvailable?: boolean;
	}
): string | null {
	const primaryCandidates = toAnimationCandidates(animationName);
	const fallbackCandidates = toAnimationCandidates(options?.fallbackAnimationName);
	const allCandidates = [...primaryCandidates, ...fallbackCandidates];
	if (allCandidates.length === 0) return null;

	const availableAnimations = getAvailableAnimations(spine);
	if (availableAnimations.length === 0) {
		return allCandidates[0] ?? null;
	}

	for (const name of allCandidates) {
		if (availableAnimations.includes(name)) {
			return name;
		}
	}

	if (options?.fallbackToFirstAvailable) {
		return availableAnimations[0] ?? null;
	}

	return null;
}

function normalizeStartOptions(
	animationNameOrOptions: string | StartAnimationOptions,
	timeScale: number,
	loop: boolean
): StartAnimationOptions {
	return typeof animationNameOrOptions === 'string'
		? {
			animationName: animationNameOrOptions,
			timeScale,
			loop,
			trackIndex: 0,
			fallbackToFirstAvailable: false,
			logWhenMissing: true
		}
		: {
			trackIndex: 0,
			loop: true,
			timeScale,
			fallbackToFirstAvailable: false,
			logWhenMissing: true,
			...animationNameOrOptions
		};
}

/**
 * Backward-compatible overload:
 * 1) startAnimation(spine, 'idle', 1, true)
 * 2) startAnimation(spine, { animationName: ['idle', 'default'], trackIndex: 0, loop: true })
 */
export function startAnimationWithEntry(
	spine: any,
	animationNameOrOptions: string | StartAnimationOptions,
	timeScale: number = 1,
	loop: boolean = true
): StartAnimationResult | null {
	const state = getAnimationState(spine);
	if (!state) return null;

	const opts = normalizeStartOptions(animationNameOrOptions, timeScale, loop);

	const resolvedName = resolveAnimationName(spine, opts.animationName, {
		fallbackAnimationName: opts.fallbackAnimationName,
		fallbackToFirstAvailable: opts.fallbackToFirstAvailable
	});

	if (!resolvedName) {
		if (opts.logWhenMissing) {
			console.warn('[SpineAnimationHelper] No valid animation found', {
				requested: opts.animationName,
				available: getAvailableAnimations(spine)
			});
		}
		return null;
	}

	try {
		const entry = state.setAnimation(opts.trackIndex ?? 0, resolvedName, opts.loop ?? true);
		if (entry && typeof (entry as any).timeScale === 'number' && (opts.timeScale ?? 0) > 0) {
			(entry as any).timeScale = opts.timeScale;
		}
		return {
			animationName: resolvedName,
			entry
		};
	} catch (e) {
		console.warn('[SpineAnimationHelper] Failed to start animation', resolvedName, e);
		return null;
	}
}

/**
 * Backward-compatible overload:
 * 1) startAnimation(spine, 'idle', 1, true)
 * 2) startAnimation(spine, { animationName: ['idle', 'default'], trackIndex: 0, loop: true })
 */
export function startAnimation(
	spine: any,
	animationNameOrOptions: string | StartAnimationOptions,
	timeScale: number = 1,
	loop: boolean = true
): string | null {
	const result = startAnimationWithEntry(spine, animationNameOrOptions, timeScale, loop);
	return result?.animationName ?? null;
}

export function queueAnimation(spine: any, options: QueueAnimationOptions): string | null {
	const state = getAnimationState(spine);
	if (!state || typeof state.addAnimation !== 'function') return null;

	const resolvedName = resolveAnimationName(spine, options.animationName, {
		fallbackAnimationName: options.fallbackAnimationName,
		fallbackToFirstAvailable: options.fallbackToFirstAvailable
	});

	if (!resolvedName) {
		if (options.logWhenMissing ?? true) {
			console.warn('[SpineAnimationHelper] No valid queued animation found', {
				requested: options.animationName,
				available: getAvailableAnimations(spine)
			});
		}
		return null;
	}

	try {
		const entry = state.addAnimation(
			options.trackIndex ?? 0,
			resolvedName,
			options.loop ?? false,
			options.delay ?? 0
		);
		if (entry && typeof (entry as any).timeScale === 'number' && (options.timeScale ?? 0) > 0) {
			(entry as any).timeScale = options.timeScale;
		}
		return resolvedName;
	} catch (e) {
		console.warn('[SpineAnimationHelper] Failed to queue animation', resolvedName, e);
		return null;
	}
}

/**
 * Backward-compatible overload:
 * 1) stopAnimation(spine, 0.2)
 * 2) stopAnimation(spine, { fadeOut: 0.2, trackIndex: 0, clearAllTracks: false })
 */
export function stopAnimation(spine: any, fadeOutOrOptions: number | StopAnimationOptions = 0.2): void {
	const state = getAnimationState(spine);
	if (!state) return;

	const opts: StopAnimationOptions =
		typeof fadeOutOrOptions === 'number'
			? { fadeOut: fadeOutOrOptions, trackIndex: 0, clearAllTracks: false }
			: { fadeOut: 0.2, trackIndex: 0, clearAllTracks: false, ...fadeOutOrOptions };

	try {
		if (opts.clearAllTracks && typeof state.clearTracks === 'function') {
			state.clearTracks();
			return;
		}

		const trackIndex = opts.trackIndex ?? 0;
		if (typeof state.setEmptyAnimation === 'function') {
			state.setEmptyAnimation(trackIndex, opts.fadeOut ?? 0.2);
		} else if (typeof state.clearTrack === 'function') {
			state.clearTrack(trackIndex);
		}
	} catch (e) {
		console.warn('[SpineAnimationHelper] Failed to stop animation', e);
	}
}

