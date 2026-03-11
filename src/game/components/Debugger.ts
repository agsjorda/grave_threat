import { Scene } from "phaser";

export class Debugger {
  public scene: Scene;
  public container: Phaser.GameObjects.Container;

  constructor() { }

  public preload(scene: Scene) {
    this.scene = scene;
  }

  public create() {
    // Win breakdown / tmp_backend hooks removed
  }
}