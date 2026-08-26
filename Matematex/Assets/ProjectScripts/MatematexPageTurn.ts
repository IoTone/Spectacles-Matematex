// MatematexPageTurn.ts — Turn pages with your hand.
//
// A horizontal sweep of the dominant hand turns the page: right-to-left goes
// forward, left-to-right goes back. That is the direction the page itself
// moves, and it is the direction your hand goes when you turn a real page.
//
// HOW TO HOLD YOUR HAND
//
//   Open hand, fingers extended, palm facing the page — the shape you would
//   use to physically sweep a page across a desk. Sweep across your field of
//   view at about reading distance.
//
//   NOT a pinch: a pinch is a button press and is gated out on purpose, since
//   pulling back from a chapter button must never turn the page.
//
//   NOT a fist: the tracker wants to see fingers. A closed hand tracks worse,
//   and this reads the index KNUCKLE, which a fist tucks away from the camera.
//
//   The sweep may finish with your hand leaving the camera's view — that is
//   normal and is handled (see TRACKING LOSS). Speed matters less than
//   distance: cross a good fraction of your view, roughly shoulder-width at
//   arm's length, in well under half a second.
//
// SETUP
//   1. Put this on a SceneObject anywhere in the scene.
//   2. Wire `bookOfMath` to the MatematexBookOfMath component.
//   3. Leave `debugLog` on for the first device session — see TUNING.
//   4. If swipes do not register at all, turn on `debugHand` FIRST. It answers
//      "is the hand being seen", which nothing else does.
//
// TRACKING LOSS — AND WHAT THE DEVICE LOG SHOWED
//
// Hand tracking drops during fast motion and at the edge of the camera's view.
// On device it drops about ONCE A SECOND: half of every `debugHand` line came
// back `tracked=false`. That is the environment this has to work in, not an
// edge case.
//
// A loss is also where a swipe legitimately ENDS, so it triggers ONE final
// judgement of the window against the last sample actually seen. But the
// history is then DISCARDED IMMEDIATELY, and that is the correction the log
// forced. Holding it across a gap — which an earlier build did, in the name of
// tolerating blinks — meant the hand could vanish on one side of the view and
// reappear on the other, and the difference between those two samples read as
// a perfect swipe. The log is full of them:
//
//     FORWARD: travel -2.63 in 585ms
//     BACK:    travel  2.85 in 568ms
//
// Two and a half SCREEN WIDTHS. No hand did that. Those are the page turns
// that felt random, and they came from the guard meant to make swipes reliable.
//
// Hence also `maxTravel`: a real sweep is bounded. Anything past it is the
// tracker teleporting, and is now named as such rather than obeyed.
//
// WHAT IT MEASURES
//
// The dominant hand's index KNUCKLE, in screen space. Knuckle rather than
// fingertip because the tip pitches several degrees as the finger curls, which
// reads as horizontal travel that the hand never made. Screen space rather than
// world space because it is the space the gesture is actually performed in: the
// wearer sweeps across their view, and how far they are standing from the book
// has nothing to do with it.
//
// TUNING
//
// The failure that matters is NOT a swipe that fails to register — it is a page
// that turns while the wearer is reaching for something else, twice, so they
// lose their place. Every threshold here exists to buy false-negatives at the
// price of false-positives, and `debugLog` prints the numbers behind each
// decision so the trade can be made against real hands rather than guessed at:
//
//     [MatematexPageTurn] rejected: travel 0.19 < 0.22
//     [MatematexPageTurn] rejected: drift 0.31 > 0.5 x travel 0.24  (diagonal)
//     [MatematexPageTurn] FORWARD: travel -0.28 in 210ms
//
// Measure the idle rate, not the hit rate: wear it, talk with your hands for a
// minute, and count the turns you did not ask for.
//
// THE RETURN STROKE
//
// A hand swipe is not one movement, it is two: you sweep, and then your hand
// comes back. The return travels the same distance, along the same line, in the
// opposite direction — which is a textbook-perfect BACK swipe arriving about
// half a second after the FORWARD one. The first build turned the page and
// turned it straight back.
//
// A longer cooldown alone does not fix this; it only moves the race. Nor does
// "wait until the hand is slow", checked frame by frame — and that one is worth
// spelling out, because it looks right and is exactly wrong:
//
//     A hand reversing direction passes through ZERO VELOCITY at the turn.
//
// So a single-frame "is the hand slow?" test succeeds at the precise instant
// between the two halves of the wave — the detector re-arms at the turnaround,
// and the return stroke that follows is a clean, fully qualified swipe. That
// shipped, and it is why the page still turned back.
//
// What actually distinguishes the end of a gesture from the middle of one is
// DURATION of stillness, not stillness. So:
//
//   1. Sustained settle. The hand must stay under `settleSpeed` continuously
//      for `settleHold`. A turnaround dip lasts a frame or two; a hand that has
//      finished lingers.
//   2. Reversal lockout. A turn in the OPPOSITE direction to the last one needs
//      `reverseLockout` seconds, not `backoff`. Paging on and on in one
//      direction is normal; instantly reversing is the return stroke's
//      signature, so it has to prove itself.
//
// THE WINDOW
//
// Detection is a SLIDING WINDOW, not a stroke with a start. The first build
// pinned an origin and re-seeded it whenever the sweep ran past `maxDuration` —
// which quietly ate real swipes, because re-seeding mid-sweep threw away the
// travel already banked. Instead, every frame looks back over the last
// `maxDuration` seconds of samples and takes the one that gives the largest
// horizontal travel while still passing the drift test. Nothing to seed,
// nothing to lose, and a swipe registers the moment it has gone far enough.

// The page-turn SOUND lives on MatematexBookOfMath, not here. The page turns
// from three places — a swipe, the prev/next buttons, and a jump out of search
// — and a sound only one of them makes is a sound that seems broken.

import { SIK } from "SpectaclesInteractionKit.lspkg/SIK";
import { MatematexBookOfMath } from './MatematexBookOfMath';

@component
export class MatematexPageTurn extends BaseScriptComponent {

    @input
    @hint("The MatematexBookOfMath component whose pages this turns.")
    bookOfMath: MatematexBookOfMath;

    @input('bool', 'true')
    @hint("Master switch. Off leaves the buttons as the only way to turn a page.")
    gestureEnabled: boolean;

    @input('float', '0.22')
    @hint("How far the hand must travel horizontally, as a fraction of the screen. Lower = easier to trigger AND easier to trigger by accident.")
    travelThreshold: number;

    @input('float', '1.2')
    @hint("Vertical drift allowed, as a multiple of horizontal travel. A real arm sweep ARCS, and the device log rejected honest 0.22-0.30 sweeps at 0.8. 1.2 is about 50 degrees, which is safe now that maxTravel catches the wild ones.")
    driftRatio: number;

    @input('float', '0.6')
    @hint("Seconds of history the detector looks back over. A sweep must complete inside this window; anything slower is a reach.")
    maxDuration: number;

    @input('float', '0.45')
    @hint("Seconds after a turn before the detector will even consider re-arming. See THE RETURN STROKE above — this is only half of what stops a double turn.")
    backoff: number;

    @input('float', '0.70')
    @hint("Screen widths per second below which the hand counts as settled. Raised from 0.4 after the device log showed the re-arm almost always falling through to its timeout — a hand held up in view is never as still as 0.4/s.")
    settleSpeed: number;

    @input('float', '0.25')
    @hint("Seconds the hand must stay under settleSpeed CONTINUOUSLY before the detector re-arms. This is the number that stops the return stroke: a hand reversing direction is briefly slow at the turnaround, but only briefly. Raise it if pages still turn back.")
    settleHold: number;

    @input('float', '1.20')
    @hint("Seconds before a turn in the OPPOSITE direction to the last one is allowed. Same-direction paging only waits for backoff. Raise it if reversals still slip through.")
    reverseLockout: number;

    @input('float', '2.0')
    @hint("Hard ceiling: re-arm this many seconds after a turn even if the hand never settles. A detector that never re-arms is worse than one that occasionally turns twice — it kills the feature silently.")
    maxDisarm: number;

    @input('float', '0.15')
    @hint("Seconds over which speed is measured. Frame-to-frame differencing multiplies tracking jitter by the frame rate; this is the smoothing that makes 'settled' mean anything.")
    speedBaseline: number;

    @input('float', '0.80')
    @hint("Largest sweep accepted, in screen widths. Above this it is not an arm, it is the tracker losing the hand and re-acquiring it somewhere else — the device log showed phantom 2.6-screen-width 'swipes' doing exactly that.")
    maxTravel: number;

    @input('bool', 'false')
    @hint("Flip forward and back. The base mapping is the one measured on device — right-to-left pages forward. Tick this only if a future SDK flips the camera's screen-space x again.")
    invertDirection: boolean;

    @input('bool', 'false')
    @hint("Print the hand's state twice a second — tracked, pinching, position. Very noisy; turn it on only when swipes do not register at all, because it answers 'is the hand being seen', which no other log does.")
    debugHand: boolean;

    @input('bool', 'false')
    @hint("Diagnostics: why strokes were rejected, and why the detector is disarmed. Off by default — a page turn always logs one line regardless, which is the part worth reading. Rejections are aggregated, not printed per frame.")
    debugLog: boolean;

    // ─── Stroke state ───────────────────────────────────────────────────
    //
    // One stroke at a time. `active` is false whenever there is no hand to
    // measure, which is also what makes losing tracking mid-sweep safe: the
    // stroke is abandoned rather than resumed against a stale origin, and a
    // stale origin is exactly how a hand that reappears somewhere else fires a
    // turn nobody asked for.
    /** Rolling history of knuckle samples, trimmed to `maxDuration`. */
    private sx: number[] = [];
    private sy: number[] = [];
    private st: number[] = [];
    private lastTurnT: number = -999;
    /** +1 forward, −1 back, 0 for "no turn yet". Drives the reversal lockout. */
    private lastTurnDir: number = 0;
    /** When the hand last went under settleSpeed, or −1 while it is moving. */
    private settledSince: number = -1;
    private lastHandLog: number = -999;
    // Rejections happen on EVERY FRAME a near-miss sits in the window, which
    // turned one swipe into thirty identical log lines. Count them instead and
    // report a summary at most once a second.
    private rejDrift: number = 0;
    private rejJump: number = 0;
    private rejWorstDrift: number = 0;
    private rejWorstJump: number = 0;
    private lastRejLog: number = -999;
    private evaluatedOnLoss: boolean = false;
    /** False from the moment a turn fires until the hand has both waited and
     *  stopped. This, not the clock, is what kills the return stroke. */
    private armed: boolean = true;


    onAwake(): void {
        if (!this.bookOfMath) {
            print('[MatematexPageTurn] ERROR: bookOfMath not assigned — gestures are inert');
            return;
        }
        this.createEvent('UpdateEvent').bind(() => this.onUpdate());
        print('[MatematexPageTurn] watching the dominant hand for page turns');
    }

    private onUpdate(): void {
        if (!this.gestureEnabled || !this.bookOfMath) return;

        // getTime() is the FRAME clock. That is wrong for timing work inside a
        // single frame (see the proof-build timer, which had to move to
        // Date.now()) and exactly right here, where every measurement spans
        // frames and the frame clock is the cheaper read.
        const now = getTime();

        const hand = this.hand();
        const tracked = !!hand && hand.isTracked();
        const pinching = tracked && hand.isPinching();
        const p = tracked && !pinching ? this.knuckle(hand) : null;

        if (this.debugHand && now - this.lastHandLog > 0.5) {
            this.lastHandLog = now;
            print(`[MatematexPageTurn] hand: tracked=${tracked} pinching=${pinching} ` +
                  (p ? `at ${p.x.toFixed(2)},${p.y.toFixed(2)} ` : 'no knuckle ') +
                  `samples=${this.st.length} armed=${this.armed}`);
        }

        if (!p) {
            // A swipe ENDS by the hand leaving the camera's view or outrunning
            // the tracker — so this branch is not an error case, it is the last
            // frame of a good gesture. Clearing here (which is what the first
            // build did) made a completed swipe erase its own evidence.
            //
            // Instead: judge the window one final time against the last sample
            // we actually saw, then hold the history until the grace period is
            // up in case tracking simply blinked.
            if (this.st.length > 1 && !this.evaluatedOnLoss) {
                this.evaluatedOnLoss = true;
                const last = this.st.length - 1;
                this.tryTurn(this.sx[last], this.sy[last], this.st[last], now);
            }
            // Then DROP it. Carrying samples across the gap is what produced
            // the phantom multi-screen sweeps — see the header. Whatever the
            // hand was doing before it vanished has been judged already.
            this.reset();
            return;
        }
        this.evaluatedOnLoss = false;

        // ─── History ────────────────────────────────────────────────────
        this.sx.push(p.x); this.sy.push(p.y); this.st.push(now);
        while (this.st.length > 1 && now - this.st[0] > this.maxDuration) {
            this.sx.shift(); this.sy.shift(); this.st.shift();
        }

        // Speed over a BASELINE, not frame to frame.
        //
        // Differencing consecutive frames divides tracking jitter by the frame
        // interval, which at 60 fps multiplies it by sixty: a half-percent
        // wobble reads as 0.3 screen widths per second from a hand that is
        // sitting still. Measured that way the hand is never "settled", the
        // detector never re-arms after its first turn, and every later swipe
        // is silently dropped. Over 0.15 s the same wobble is noise again.
        const speed = this.speedOverBaseline(p, now);

        // Stillness is measured by how LONG it lasts, not whether it is true
        // this frame — a hand reversing direction is momentarily still at the
        // turnaround, and that instant is the whole bug this guards against.
        if (speed < this.settleSpeed) {
            if (this.settledSince < 0) this.settledSince = now;
        } else {
            this.settledSince = -1;
        }
        const settledFor = this.settledSince < 0 ? 0 : now - this.settledSince;

        // ─── Re-arm ─────────────────────────────────────────────────────
        if (!this.armed) {
            const since = now - this.lastTurnT;
            const settled = since >= this.backoff && settledFor >= this.settleHold;

            // A hard ceiling, because a detector that never re-arms is worse
            // than one that occasionally turns twice: the first costs the
            // reader the whole feature, silently, with no way to tell it apart
            // from "the gesture just doesn't work". If the settle test has not
            // fired by now, stop believing it.
            const timedOut = since >= this.maxDisarm;

            if (settled || timedOut) {
                this.armed = true;
                this.clearHistory();
                // Only the timeout is worth a line unprompted: it means the
                // settle test is mistuned, which is a real finding. A normal
                // re-arm is the system working and says nothing.
                if (timedOut) {
                    print(`[MatematexPageTurn] re-armed by TIMEOUT after ${since.toFixed(1)}s ` +
                          `— hand never settled (${speed.toFixed(2)}/s vs ${this.settleSpeed}); ` +
                          `raise settleSpeed if this keeps happening`);
                } else if (this.debugLog) {
                    print(`[MatematexPageTurn] re-armed ${since.toFixed(2)}s after the turn`);
                }
            }
            return;
        }

        this.tryTurn(p.x, p.y, now, now);
    }

    /** Judge the accumulated window against a head sample and turn the page if
     *  it qualifies. `headT` is when that sample was taken; `now` is the clock
     *  used for the lockouts, which differ when this runs on tracking loss. */
    private tryTurn(hx: number, hy: number, headT: number, now: number): void {
        // The sample giving the largest horizontal travel that ALSO passes the
        // drift test. Taking the largest travel first and checking drift after
        // would throw away a good sweep because one stale sample happened to
        // sit high or low.
        let bestDx = 0, bestDt = 0, found = false;
        for (let i = 0; i < this.st.length; i++) {
            if (this.st[i] >= headT) break;
            const dx = hx - this.sx[i];
            const dy = hy - this.sy[i];
            if (Math.abs(dx) < this.travelThreshold) continue;
            if (Math.abs(dx) > this.maxTravel) {
                this.rejJump++;
                if (Math.abs(dx) > this.rejWorstJump) this.rejWorstJump = Math.abs(dx);
                continue;
            }
            if (Math.abs(dy) > this.driftRatio * Math.abs(dx)) {
                this.rejDrift++;
                if (Math.abs(dx) > this.rejWorstDrift) this.rejWorstDrift = Math.abs(dx);
                continue;
            }
            if (Math.abs(dx) > Math.abs(bestDx)) {
                bestDx = dx; bestDt = headT - this.st[i]; found = true;
            }
        }

        if (!found) { this.flushRejections(now); return; }

        // MEASURED, not assumed. The reasoning was: screen x grows to the
        // right, so a right-to-left sweep is negative, and right-to-left is how
        // you turn to the next page of a real book — therefore dx < 0 is
        // forward. On device that came out backwards, so the camera's
        // screen-space x runs the other way for a hand seen from the wearer's
        // own viewpoint. Take the device's word for it.
        let dir = bestDx > 0 ? 1 : -1;
        if (this.invertDirection) dir = -dir;

        // A reversal straight after a turn is the return stroke's signature.
        if (dir !== this.lastTurnDir && this.lastTurnDir !== 0 &&
            now - this.lastTurnT < this.reverseLockout) {
            if (this.debugLog && now - this.lastRejLog > 1.0) {
                this.lastRejLog = now;
                print(`[MatematexPageTurn] reversal ${(now - this.lastTurnT).toFixed(2)}s ` +
                      `after a turn — held off as a return stroke`);
            }
            return;
        }

        if (!this.bookOfMath.canTurnPage()) {
            this.clearHistory();
            return;
        }

        // Always logged, whatever debugLog says: one line per page turn is the
        // signal. Everything else in this file is noise around it.
        print(`[MatematexPageTurn] ${dir > 0 ? 'FORWARD' : 'BACK'} ` +
              `${bestDx.toFixed(2)} in ${(bestDt * 1000).toFixed(0)}ms`);
        this.rejDrift = 0; this.rejJump = 0;
        this.rejWorstDrift = 0; this.rejWorstJump = 0;
        this.bookOfMath.navigate(dir);
        this.lastTurnT = now;
        this.lastTurnDir = dir;
        this.armed = false;          // until the hand waits AND stays still
        this.settledSince = -1;      // it is certainly moving right now
        this.clearHistory();
    }

    /** Give up on the stroke. Only called once the grace period has expired:
     *  a sample from before a LONG gap, differenced against one after it, is a
     *  sweep the hand never made. */
    private reset(): void {
        this.clearHistory();
        this.settledSince = -1;
        this.evaluatedOnLoss = false;
    }

    /** Speed in screen widths per second, measured against the oldest sample
     *  within `speedBaseline` of now rather than the previous frame. */
    private speedOverBaseline(p: vec2, now: number): number {
        for (let i = this.st.length - 1; i >= 0; i--) {
            const dt = now - this.st[i];
            if (dt >= this.speedBaseline) {
                if (dt <= 0) return 0;
                const dx = p.x - this.sx[i];
                const dy = p.y - this.sy[i];
                return Math.sqrt(dx * dx + dy * dy) / dt;
            }
        }
        // Not enough history yet — treat as moving, so nothing re-arms on the
        // strength of two samples.
        return this.settleSpeed + 1;
    }

    /** Report near-misses as a count, not a line each. A swipe that hovers just
     *  outside the gates sits in the window for dozens of frames and would
     *  otherwise print on every one of them. */
    private flushRejections(now: number): void {
        if (!this.debugLog) return;
        if (this.rejDrift === 0 && this.rejJump === 0) return;
        if (now - this.lastRejLog < 1.0) return;
        this.lastRejLog = now;
        const parts: string[] = [];
        if (this.rejDrift > 0) {
            parts.push(`${this.rejDrift} too diagonal (widest ` +
                       `${this.rejWorstDrift.toFixed(2)}; raise driftRatio)`);
        }
        if (this.rejJump > 0) {
            parts.push(`${this.rejJump} tracking jumps (widest ` +
                       `${this.rejWorstJump.toFixed(2)})`);
        }
        print(`[MatematexPageTurn] near misses: ${parts.join(', ')}`);
        this.rejDrift = 0; this.rejJump = 0;
        this.rejWorstDrift = 0; this.rejWorstJump = 0;
    }

    private clearHistory(): void {
        this.sx.length = 0;
        this.sy.length = 0;
        this.st.length = 0;
    }

    /** The dominant hand, or null if hand input is unavailable — which is the
     *  normal case in the Lens Studio preview, where there is a mouse and no
     *  hands. The buttons are what make the book usable at a desk. */
    private hand(): any {
        try {
            return SIK.HandInputData.getDominantHand();
        } catch (e) {
            return null;
        }
    }

    private knuckle(hand: any): vec2 | null {
        try {
            const p = hand.indexKnuckle.screenPosition;
            // A keypoint behind the camera or otherwise unprojectable comes back
            // as NaN rather than throwing, and NaN compares false against every
            // threshold — so a stroke seeded with one would sit inert forever.
            if (!p || isNaN(p.x) || isNaN(p.y)) return null;
            return p;
        } catch (e) {
            return null;
        }
    }
}
