import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return <html lang="en"><head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#F5F6F2" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#141C18" media="(prefers-color-scheme: dark)" />
    <title>Budget Tracker</title>
    <ScrollViewStyleReset />
    <style dangerouslySetInnerHTML={{ __html: `
      :root { color-scheme: light; --focus: #193C32; --selection: #DFE9DD; --selection-text: #193C32; }
      body { background: #F5F6F2; }
      input, textarea { caret-color: var(--focus); }
      ::selection { background: var(--selection); color: var(--selection-text); }
      :focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
      @media (prefers-color-scheme: dark) {
        :root { color-scheme: dark; --focus: #BDDAC4; --selection: #334D3C; --selection-text: #F0F3EC; }
        body { background: #141C18; }
      }
      @media (hover: hover) and (pointer: fine) {
        [role="button"]:not([aria-disabled="true"]):hover { filter: brightness(0.96); }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { scroll-behavior: auto !important; }
      }
    ` }} />
  </head><body>{children}</body></html>;
}
