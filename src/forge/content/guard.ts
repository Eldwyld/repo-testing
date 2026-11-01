/**
 * Content guard: petplay / animal-role terminology is excluded from this fork.
 *
 * The built-in list is fixed in code and cannot be removed through the UI or
 * imports. Users may add *additional* prohibited words (per identity or
 * globally); they cannot subtract from the built-in list. Every dictionary,
 * phrase pool, event, prompt and identity passes through `scanText` /
 * `scanValue` before it is stored or rendered, so imported data cannot
 * silently introduce excluded vocabulary.
 */

export type GuardFinding = {
  term: string;
  category: 'petplay' | 'animal-role' | 'pet-command' | 'user';
  match: string;
  path?: string;
};

type Rule = { term: string; category: GuardFinding['category'] };

const words = (category: GuardFinding['category'], list: string) =>
  list
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(term => ({ term, category }));

export const BUILTIN_PROHIBITED: readonly Rule[] = Object.freeze([
  ...words(
    'petplay',
    'pet, pets, petplay, pet play, petplayer, puppy, puppies, pup, pups, pupper, puppyplay, kitten, kittens, kitty, kitties, kittenplay, catgirl, cat girl, catboy, cat boy, pony, ponies, ponyplay, pony play, ponygirl, ponyboy, doggy, doggie, piggy, piglet, bunny, bunnies, leash, leashed, kennel, kenneled, collar, collared, kibble, food bowl, water bowl, pet bowl, tail plug, paw, paws, pawing, pawed, petted'
  ),
  ...words(
    'animal-role',
    'animal, animals, beast, beasts, bitch, bitches, dog, dogs, hound, hounds, mutt, cow, cows, heifer, pig, pigs, filly, mare, stallion, vixen, critter'
  ),
  ...words(
    'pet-command',
    'woof, bark, barking, barks, meow, mew, mewl, purr, purring, purrs, fetch, roll over, play dead, sit pretty, to heel, good puppy, good kitty, good pet'
  ),
]);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '7': 't' };

/** Lower-case, strip diacritics, undo trivial leetspeak, collapse separators. */
export function normalizeForGuard(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[0134@57]/g, c => LEET[c] ?? c)
    .replace(/[^a-z\s'-]+/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compile(rules: readonly Rule[]) {
  return rules.map(rule => {
    const norm = normalizeForGuard(rule.term);
    const escaped = norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
    return { ...rule, re: new RegExp(`(?:^|[^a-z])(${escaped})(?:'s)?(?=$|[^a-z])`, 'i') };
  });
}

const builtinCompiled = compile(BUILTIN_PROHIBITED);

export function scanText(text: string, extra: readonly string[] = []): GuardFinding[] {
  if (!text) return [];
  const norm = normalizeForGuard(text);
  const findings: GuardFinding[] = [];
  const all = extra.length
    ? [...builtinCompiled, ...compile(extra.filter(Boolean).map(term => ({ term, category: 'user' as const })))]
    : builtinCompiled;
  for (const rule of all) {
    const m = rule.re.exec(norm);
    if (m) findings.push({ term: rule.term, category: rule.category, match: m[1] });
  }
  return findings;
}

export function isClean(text: string, extra: readonly string[] = []) {
  return scanText(text, extra).length === 0;
}

/**
 * Walk every string in an arbitrary JSON-like value. Object keys that are
 * pure identifiers are scanned too, so `{"pet": ...}` cannot sneak in.
 */
export function scanValue(value: unknown, extra: readonly string[] = [], path = ''): GuardFinding[] {
  const out: GuardFinding[] = [];
  const visit = (node: unknown, at: string) => {
    if (typeof node === 'string') {
      for (const f of scanText(node, extra)) out.push({ ...f, path: at || '(root)' });
    } else if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${at}[${i}]`));
    } else if (node && typeof node === 'object') {
      for (const [k, child] of Object.entries(node)) {
        const childPath = at ? `${at}.${k}` : k;
        for (const f of scanText(k.replace(/([a-z])([A-Z])/g, '$1 $2'), extra))
          out.push({ ...f, path: `${childPath} (key)` });
        visit(child, childPath);
      }
    }
  };
  visit(value, path);
  return out;
}

export function describeFindings(findings: GuardFinding[]): string {
  return findings
    .map(f => `"${f.match}" (${f.category}${f.path ? ` at ${f.path}` : ''})`)
    .join(', ');
}
