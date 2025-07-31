declare var console: {
  log(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  // add more methods if you like
};

interface Element {
    
}

declare var Element: {
    prototype: Element;
    new(): Element;
};

interface HTMLElement extends Element {
    
}

declare var HTMLElement: {
    prototype: HTMLElement;
    new(): HTMLElement;
};
