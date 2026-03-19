export interface ScreenConfig {
    isPortrait: boolean;
}

export class ScreenModeManager {
    private isPortrait: boolean;
    private forcedMode: 'portrait' | 'landscape' | null;
    private orientationChangeCallbacks: Array<(config: ScreenConfig) => void> = [];

    constructor() {
        this.isPortrait = this.detectOrientation();
        this.forcedMode = null;
        
        // Add event listener for orientation changes
        window.addEventListener('resize', this.handleOrientationChange.bind(this));
        window.addEventListener('orientationchange', this.handleOrientationChange.bind(this));
    }

    private detectOrientation(): boolean {
        const isPortrait = window.innerHeight > window.innerWidth;
        return isPortrait;
    }

    private handleOrientationChange(): void {
        if (this.forcedMode) {
            // If orientation is forced, don't update based on actual screen changes
            return;
        }
        
        const newIsPortrait = this.detectOrientation();
        if (newIsPortrait !== this.isPortrait) {
            this.isPortrait = newIsPortrait;
            
            // Notify all callbacks
            const config = this.getScreenConfig();
            this.orientationChangeCallbacks.forEach(callback => callback(config));
        }
    }

    public forceOrientation(mode: 'portrait' | 'landscape'): void {
        this.forcedMode = mode;
        this.isPortrait = mode === 'portrait';
        
        // Notify all callbacks
        const config = this.getScreenConfig();
        this.orientationChangeCallbacks.forEach(callback => callback(config));
    }

    public getScreenConfig(): ScreenConfig {
        return { isPortrait: this.isPortrait };
    }

    public onOrientationChange(callback: (config: ScreenConfig) => void): void {
        this.orientationChangeCallbacks.push(callback);
    }

    public removeOrientationChangeListener(callback: (config: ScreenConfig) => void): void {
        const index = this.orientationChangeCallbacks.indexOf(callback);
        if (index > -1) {
            this.orientationChangeCallbacks.splice(index, 1);
        }
    }
}