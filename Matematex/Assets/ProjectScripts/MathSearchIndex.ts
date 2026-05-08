// MathSearchIndex.ts — tokenized inverted index over MathFormula entries.
//
// Pure TypeScript, no Lens Studio dependencies — testable in node.
// Indexes name + chapter + curated keywords. Substring fallback covers
// near-misses and partial typing. Ranking favors name matches over
// chapter/keyword matches.

import { MathFormula } from './MathBookData';

export interface MathSearchIndex {
    search(query: string, limit?: number): MathFormula[];
}

interface IndexedEntry {
    formula: MathFormula;
    nameTokens: Set<string>;
    chapterTokens: Set<string>;
    keywordTokens: Set<string>;
    searchString: string;
}

const STOP_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'in']);

function normalize(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function tokenize(s: string): string[] {
    const out: string[] = [];
    const parts = normalize(s).split(/\s+/);
    for (const p of parts) {
        if (!p || STOP_WORDS.has(p)) continue;
        // Drop single-char tokens — they're almost always artefacts of
        // punctuation splits (e.g., "Heron's" → "heron" + "s") and they
        // poison prefix matching ("svd".startsWith("s") would otherwise
        // hit every name with an apostrophe-s).
        if (p.length < 2) continue;
        // Trivial stem: drop trailing 's' for words longer than 3 chars
        const stemmed = p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p;
        out.push(stemmed);
    }
    return out;
}

function tokenSet(s: string): Set<string> {
    return new Set(tokenize(s));
}

export function buildIndex(formulas: MathFormula[]): MathSearchIndex {
    const entries: IndexedEntry[] = formulas.map(f => {
        const nameTokens = tokenSet(f.name);
        const chapterTokens = tokenSet(f.chapter);
        const keywordTokens = new Set<string>();
        if (f.keywords) {
            for (const kw of f.keywords) {
                for (const t of tokenize(kw)) keywordTokens.add(t);
            }
        }
        const searchString = normalize(
            f.name + ' ' + f.chapter + ' ' + (f.keywords || []).join(' ')
        );
        return { formula: f, nameTokens, chapterTokens, keywordTokens, searchString };
    });

    function scoreEntry(entry: IndexedEntry, queryTokens: string[], rawQuery: string): number {
        if (queryTokens.length === 0 && !rawQuery) return 0;

        let score = 0;
        let matchedTokens = 0;

        for (const qt of queryTokens) {
            let matched = false;
            // Exact token match in name (highest weight)
            if (entry.nameTokens.has(qt)) {
                score += 100; matched = true;
            }
            // Token prefix match in name (e.g. "pythag" → "pythagorean")
            else {
                for (const nt of entry.nameTokens) {
                    if (nt.startsWith(qt) || qt.startsWith(nt)) {
                        score += 60; matched = true; break;
                    }
                }
            }
            if (matched) { matchedTokens++; continue; }
            // Chapter match
            if (entry.chapterTokens.has(qt)) { score += 30; matchedTokens++; continue; }
            // Keyword exact match
            if (entry.keywordTokens.has(qt)) { score += 25; matchedTokens++; continue; }
            // Keyword prefix match
            for (const kt of entry.keywordTokens) {
                if (kt.startsWith(qt) || qt.startsWith(kt)) {
                    score += 15; matched = true; break;
                }
            }
            if (matched) { matchedTokens++; }
        }

        // Multi-token coverage boost: an entry that matches all of a
        // multi-word query is better than one that matches only one of
        // its tokens, even if that one token hits the entry's name.
        // Without this, "right triangle" → Pythagorean (both keywords match)
        // loses to Area of Triangle (only "triangle" matches, but in name).
        if (queryTokens.length > 1 && matchedTokens > 1) {
            score *= matchedTokens;
        }

        // Substring fallback: the raw normalized query appears as a substring
        // somewhere in the searchString. Generous to typos.
        if (score === 0 && rawQuery) {
            const normalizedQuery = normalize(rawQuery).replace(/\s+/g, '');
            if (normalizedQuery && entry.searchString.replace(/\s+/g, '').indexOf(normalizedQuery) !== -1) {
                score = 10;
            }
        }

        // Earlier position in name = better tiebreaker
        if (score > 0 && rawQuery) {
            const pos = entry.searchString.indexOf(normalize(rawQuery).trim());
            if (pos >= 0) score += Math.max(0, 5 - Math.floor(pos / 10));
        }

        return score;
    }

    function search(query: string, limit: number = 20): MathFormula[] {
        const trimmed = (query || '').trim();
        if (!trimmed) {
            // Empty query → return the first `limit` formulas (alphabetized
            // by chapter/id ordering already in source array).
            return entries.slice(0, limit).map(e => e.formula);
        }
        const queryTokens = tokenize(trimmed);
        const scored: { score: number; formula: MathFormula }[] = [];
        for (const entry of entries) {
            const score = scoreEntry(entry, queryTokens, trimmed);
            if (score > 0) scored.push({ score, formula: entry.formula });
        }
        scored.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.formula.id - b.formula.id;
        });
        return scored.slice(0, limit).map(s => s.formula);
    }

    return { search };
}
