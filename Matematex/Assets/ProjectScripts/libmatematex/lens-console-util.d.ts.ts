declare module 'SpectaclesInteractionKit.lspkg/Utils/NativeLogger' {
  export default class NativeLogger {
    constructor(tag: string, logLevelProvider?: any);

    d(message: string): void;    // debug
    i(message: string): void;    // info
    w(message: string): void;    // warning
    e(message: string): void;    // error
    f(message: string): void;    // fatal (throws)
  }
}