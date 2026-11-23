// jsdom は AnimationEvent を実装していないが、style には WebkitAnimation を持つ。
// このとき React は animationend ではなく webkitAnimationEnd を購読するので、
// fireEvent.animationEnd が届くように、React を読み込む前に AnimationEvent を定義しておく。
if (!('AnimationEvent' in window)) {
  class AnimationEventPolyfill extends Event {
    readonly animationName: string;
    readonly elapsedTime: number;
    readonly pseudoElement: string;

    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init);
      this.animationName = init.animationName ?? '';
      this.elapsedTime = init.elapsedTime ?? 0;
      this.pseudoElement = init.pseudoElement ?? '';
    }
  }
  Object.defineProperty(window, 'AnimationEvent', {
    value: AnimationEventPolyfill,
    configurable: true,
    writable: true,
  });
}
