// nav-reachability.test.ts — can the reader always get somewhere?
//
//   npx ts-node --transpile-only test/nav-reachability.test.ts
//
// A screen with no live control is a trap: the lens is still running, still
// rendering, and the reader has no move. That is exactly what shipped when the
// page-turn gesture was disabled — the cover hid every button on the principle
// that a cover has none, which was true and fine right up until the gesture
// that opened it went away.
//
// This models MatematexBookOfMath.showScreen's enable rules directly. It is a
// TRANSCRIPTION, not an import: showScreen needs a live scene, so the rules are
// restated here and this test is only as good as that restatement staying in
// step. Keep the table below next to the real one when either changes.

type Screen = 'cover' | 'splash' | 'contents' | 'formula' | 'proof' | 'about' | 'search';

const GESTURES_ENABLED = false;   // MatematexPageTurn.gestureEnabled default

/** Which controls showScreen leaves enabled, per screen. */
function liveControls(s: Screen, formulaHasProof: boolean): string[] {
    const out: string[] = [];
    const onCover = s === 'cover', onSplash = s === 'splash', onContents = s === 'contents';
    const onAbout = s === 'about', onSearch = s === 'search', onProof = s === 'proof';

    if ((s === 'formula' && formulaHasProof) || onProof) out.push('proof');
    if (onContents) out.push('chapter x4');
    if (onSplash || onContents) out.push('search');
    if (onSplash || onContents || onAbout) out.push('about');
    if (!onSearch && !onAbout && !onProof && !onCover) out.push('prev');
    if (!onSearch && !onAbout && !onProof) out.push('next');
    if (onSearch) out.push('close');           // the search screen's own button
    if (GESTURES_ENABLED && !onSearch && !onProof) out.push('swipe');
    return out;
}

const SCREENS: Screen[] = ['cover', 'splash', 'contents', 'formula', 'proof', 'about', 'search'];
let failed = 0;

console.log(`navigation reachability — gestures ${GESTURES_ENABLED ? 'ON' : 'OFF'}\n`);
for (const s of SCREENS) {
    // A formula with no proof is the weaker case, so test that one.
    const controls = liveControls(s, false);
    const ok = controls.length > 0;
    if (!ok) failed++;
    console.log(`  ${ok ? 'ok  ' : 'TRAP'} ${s.padEnd(9)} ${controls.join(', ') || '(nothing — the reader is stuck)'}`);
}

console.log();
if (failed > 0) {
    console.log(`FAIL: ${failed} screen(s) with no way out.`);
    process.exit(1);
}
console.log('every screen has at least one live control.');
