import type { ContentSection } from '../ContentSection';
import { tumbleWinContent } from './TumbleWinContent';
import { scatterSymbolKey } from './PayoutContent';

const bonusTriggerContent: ContentSection = {
	Border: {
		opts: {
			margin: { top: 10, bottom: 10 },
			style: {
				alpha: 0,
				strokeAlpha: 0
			}
		}
	},
	Content: [
		{
			Header: {
				key: 'help_bonus-trigger-title',
				value: 'Bonus Trigger',
				opts: {
					padding: { top: 10, bottom: 10 }
				}
			}
		},
		{
			RichText: {
				opts: {
					padding: { top: 10, bottom: 10 }
				},
				placeholderImages: {
					image: {
						key: scatterSymbolKey,
						opts: { scale: 0.35, padding: { bottom: -6 } }
					}
				},
				parts: [
					{
						Text: {
							key: 'help_bonus-trigger-desc',
							value:
								'Land 3 or more {image} SCATTER symbols anywhere to trigger Free Spins.\n\n' +
								'3 Scatters award 10 free spins, 4 Scatters award 12 free spins, 5 Scatters award 15 free spins, 6 Scatters award 20 free spins, and 7 Scatters award 30 free spins.'
						}
					}
				]
			}
		}
	]
};

const inBonusFreespinRetriggerContent: ContentSection = {
	Border: {
		opts: {
			margin: { top: 10, bottom: 10 },
			style: {
				alpha: 0,
				strokeAlpha: 0
			}
		}
	},
	Content: [
		{
			Header: {
				key: 'help_retrigger-title',
				value: 'In-Bonus Freespin Retrigger',
				opts: {
					padding: { top: 10, bottom: 10 }
				}
			}
		},
		{
			RichText: {
				opts: {
					padding: { top: 10, bottom: 10 }
				},
				placeholderImages: {
					image: {
						key: scatterSymbolKey,
						opts: { scale: 0.35, padding: { bottom: -6 } }
					}
				},
				parts: [
					{
						Text: {
							key: 'help_retrigger-desc',
							value:
								'During Free Spins, landing 3 or more {image} SCATTER symbols awards additional free spins.\n\n' +
								'The number of extra spins follows the same table as the initial trigger (3→10, 4→12, 5→15, 6→20, 7→30).'
						}
					}
				]
			}
		}
	]
};

const freeSpinRoundContent: ContentSection = {
	Content: [
		{
			Image: {
				opts: {
					padding: { top: 6, right: 20, left: 20 },
					align: 0.5,
					anchor: { x: 0.5, y: 0 },
					size: 'fitToWidth'
				},
				key: 'multiplierGame'
			}
		},
		{
			Header: {
				opts: {
					padding: { top: 40, bottom: 20 }
				},
				key: 'help_freespin-round-title',
				value: 'Free Spin Round'
			}
		},
		{
			Text: {
				key: 'help_freespin-round-desc',
				value:
					'The Free Spins Feature activates with 4+ Scatters, starting with 15 spins. Multiplier symbols add to a total multiplier applied to all wins, and 3+ Scatters during the round award 5 extra spin, with special reels in play.'
			}
		}
	]
};

export const freeSpinContent: ContentSection = {
	Header: {
		key: 'help_freespin-rules-title',
		value: 'Free Spin Rules'
	},
	Border: {
		opts: {
			margin: { top: 12, bottom: 12 },
			padding: 20
		}
	},
	Content: [
		{
			Image: {
				opts: {
					padding: { top: 20, bottom: 40, right: 20, left: 0 },
					align: 0.5,
					anchor: { x: 0.5, y: 0 },
					size: 'fitToWidth'
				},
				key: 'scatterGame'
			}
		},
		{ ChildSection: bonusTriggerContent },
		{ ChildSection: inBonusFreespinRetriggerContent },
		{ ChildSection: tumbleWinContent },
		{
			LineBreak: {
				opts: {
					margin: { top: 50, bottom: 50 }
				}
			}
		},
		{ ChildSection: freeSpinRoundContent }
	]
};
