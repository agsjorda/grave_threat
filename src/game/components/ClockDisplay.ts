import { Scene } from 'phaser';
import { getMilitaryTime } from '../../utils/TimeUtils';

export interface ClockDisplayOptions {
    offsetX?: number;
    offsetY?: number;
    fontSize?: number;
    fontFamily?: string;
    color?: string;
    alpha?: number;
    depth?: number;
    scale?: number; // Scale modifier for the timer text
    suffixText?: string; // Optional text to display after the time (e.g., " | Sugar Wonderland")
    additionalText?: string; // Optional additional text (e.g., "DiJoker")
    additionalTextOffsetX?: number; // X offset for additional text
    additionalTextOffsetY?: number; // Y offset for additional text
    additionalTextScale?: number; // Scale modifier for additional text
    additionalTextColor?: string; // Color for additional text
    additionalTextFontSize?: number; // Font size for additional text
    additionalTextFontFamily?: string; // Font family for additional text
    showClock?: boolean; // When false, render only suffixText (no HH:mm prefix, no update timer). Used by replay mode.
}

export class ClockDisplay {
    private scene: Scene;
    private timeText?: Phaser.GameObjects.Text;
    private additionalText?: Phaser.GameObjects.Text;
    private timeUpdateTimer?: Phaser.Time.TimerEvent;
    private options: ClockDisplayOptions;
    private suffixText: string;
    private showClock: boolean = true;
    private appliedFontFamily: string = 'poppins-regular';
    private appliedAdditionalFontFamily: string = 'poppins-regular';

    constructor(scene: Scene, options?: ClockDisplayOptions) {
        this.scene = scene;
        this.options = options || {
            offsetX: 0,
            offsetY: 0,
            fontSize: 14,
            color: '#FFFFFF',
            alpha: 0.50,
            depth: 30000
        };
    }

    public create(): void {
        // Position clock text at top-left
        const timeX = (this.options.offsetX || 0);
        const timeY = (this.options.offsetY || 0);
        const fontSize = this.options.fontSize || 14;
        const fontFamily = this.options.fontFamily || 'poppins-regular';
        const textColor = this.options.color || '#FFFFFF';
        const alpha = this.options.alpha !== undefined ? this.options.alpha : 0.50;
        const depth = this.options.depth || 30000;
        const scale = this.options.scale !== undefined ? this.options.scale : 1.0;
        this.suffixText = this.options.suffixText || '';
        this.showClock = this.options.showClock ?? true;

        // Create time text with specified styles
        const initialTime = getMilitaryTime();
        const displayText = this.showClock
            ? (this.suffixText ? `${initialTime}${this.suffixText}` : initialTime)
            : this.suffixText;
        const timeText = this.scene.add.text(
            timeX,
            timeY,
            displayText,
            {
                fontFamily: fontFamily,
                fontSize: `${fontSize}px`,
                color: textColor,
                fontStyle: 'normal',
                align: 'left'
            }
        ).setOrigin(0.0, 0.0)
         .setScrollFactor(0)
         .setAlpha(alpha)
         .setDepth(depth)
         .setScale(scale);

        // Set font weight 500 by overriding the canvas context font
        try {
            const textObj = timeText as any;
            const originalUpdateText = textObj.updateText?.bind(textObj);
            if (originalUpdateText) {
                textObj.updateText = function(this: any) {
                    originalUpdateText();
                    if (this.context) {
                        this.context.font = `500 ${fontSize}px ${fontFamily}`;
                    }
                }.bind(textObj);
                textObj.updateText();
            }
        } catch (e) {
            console.warn('[ClockDisplay] Could not set font weight 500, using default. Error:', e);
        }

        this.timeText = timeText;
        this.appliedFontFamily = fontFamily;

        // Create additional text if provided
        if (this.options.additionalText) {
            // Position additional text at top-right
            const additionalX = this.scene.scale.width - (this.options.additionalTextOffsetX || 0);
            const additionalY = (this.options.offsetY || 0) + (this.options.additionalTextOffsetY || 0);
            const additionalFontSize = this.options.additionalTextFontSize || fontSize;
            const additionalFontFamily = this.options.additionalTextFontFamily || fontFamily;
            const additionalColor = this.options.additionalTextColor || textColor;
            const additionalScale = this.options.additionalTextScale !== undefined ? this.options.additionalTextScale : 1.0;

            const additionalTextObj = this.scene.add.text(
                additionalX,
                additionalY,
                this.options.additionalText,
                {
                    fontFamily: additionalFontFamily,
                    fontSize: `${additionalFontSize}px`,
                    color: additionalColor,
                    fontStyle: 'normal',
                    align: 'right'
                }
            ).setOrigin(1.0, 0.0)
             .setScrollFactor(0)
             .setAlpha(alpha)
             .setDepth(depth)
             .setScale(additionalScale);

            // Set font weight 500 for additional text
            try {
                const textObj = additionalTextObj as any;
                const originalUpdateText = textObj.updateText?.bind(textObj);
                if (originalUpdateText) {
                    textObj.updateText = function(this: any) {
                        originalUpdateText();
                        if (this.context) {
                            this.context.font = `500 ${additionalFontSize}px ${additionalFontFamily}`;
                        }
                    }.bind(textObj);
                    textObj.updateText();
                }
            } catch (e) {
                console.warn('[ClockDisplay] Could not set font weight 500 for additional text, using default. Error:', e);
            }

            this.additionalText = additionalTextObj;
            this.appliedAdditionalFontFamily = additionalFontFamily;
        }

        // In replay/no-clock mode we display a static label; do not create the timer.
        if (!this.showClock) {
            return;
        }

        // Update time every second
        this.timeUpdateTimer = this.scene.time.addEvent({
            delay: 1000, // Update every second
            callback: () => {
                if (this.timeText) {
                    const currentTime = getMilitaryTime();
                    const displayText = this.suffixText ? `${currentTime}${this.suffixText}` : currentTime;
                    this.timeText.setText(displayText);
                }
            },
            loop: true
        });
    }

    /**
     * Replace the suffix label. When the clock is disabled (replay mode), this also re-renders the static text.
     */
    public setSuffixText(suffixText: string): void {
        this.suffixText = suffixText || '';
        if (!this.timeText) return;
        if (!this.showClock) {
            this.timeText.setText(this.suffixText);
        } else {
            const currentTime = getMilitaryTime();
            this.timeText.setText(this.suffixText ? `${currentTime}${this.suffixText}` : currentTime);
        }
    }

    public destroy(): void {
        // Stop time update timer
        try {
            if (this.timeUpdateTimer) {
                this.timeUpdateTimer.destroy();
                this.timeUpdateTimer = undefined;
            }
        } catch {}

        // Destroy text
        try {
            if (this.timeText) {
                this.timeText.destroy();
                this.timeText = undefined;
            }
        } catch {}

        try {
            if (this.additionalText) {
                this.additionalText.destroy();
                this.additionalText = undefined;
            }
        } catch {}
    }

    public setFontFamily(fontFamily: string): void {
        this.appliedFontFamily = fontFamily;
        this.timeText?.setFontFamily(fontFamily);
    }

    public setAdditionalFontFamily(fontFamily: string): void {
        this.appliedAdditionalFontFamily = fontFamily;
        this.additionalText?.setFontFamily(fontFamily);
    }
}


