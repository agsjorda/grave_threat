export class NetworkManager {
    private isHighSpeed: boolean;

    constructor() {
        this.isHighSpeed = this.detectNetworkSpeed();
    }

    private detectNetworkSpeed(): boolean {
        // Always use high (portrait/high) assets; low-quality fallback disabled for now.
        return true;
    }

    public getNetworkSpeed(): boolean {
        return this.isHighSpeed;
    }

    public getAssetScale(): number {
        return this.isHighSpeed ? 1 : 2; // Scale low quality assets by 2x
    }
}