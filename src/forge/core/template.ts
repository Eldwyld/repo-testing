/**
 * Tiny template language used by narration, prompts and checks.
 *
 *   {token}            -> resolved value
 *   {token:arg}        -> resolved value with one argument   e.g. {part:chest}
 *   {token:arg.form}   -> argument with a form selector      e.g. {part:chest.plural}
 *   {Token} / {TOKEN}  -> capitalised / upper-cased result
 *   {{ and }}          -> literal braces
 *
 * There is no expression evaluation of any kind: a token is a name and an
 * optional argument string, both looked up through a resolver function.
 */

export type TemplateToken = {
  raw: string;
  name: string;
  arg?: string;
  casing: 'lower' | 'capital' | 'upper' | 'asis';
};

export type TemplatePart = string | TemplateToken;

const TOKEN = /\{\{|\}\}|\{([A-Za-z][A-Za-z0-9_]*)(?::([^{}]*))?\}/g;

function casingOf(name: string): TemplateToken['casing'] {
  if (name.length > 1 && name === name.toUpperCase() && /[A-Z]/.test(name))
    return 'upper';
  if (name[0] === name[0].toUpperCase() && /[A-Z]/.test(name[0]))
    return 'capital';
  if (name === name.toLowerCase()) return 'lower';
  return 'asis';
}

export function parseTemplate(template: string): TemplatePart[] {
  const parts: TemplatePart[] = [];
  let last = 0;
  for (const match of template.matchAll(TOKEN)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(template.slice(last, index));
    if (match[0] === '{{') parts.push('{');
    else if (match[0] === '}}') parts.push('}');
    else {
      const name = match[1];
      parts.push({
        raw: match[0],
        name: name.toLowerCase(),
        arg: match[2]?.trim() || undefined,
        casing: casingOf(name),
      });
    }
    last = index + match[0].length;
  }
  if (last < template.length) parts.push(template.slice(last));
  return parts;
}

export function applyCasing(value: string, casing: TemplateToken['casing']) {
  switch (casing) {
    case 'upper':
      return value.toUpperCase();
    case 'capital':
      return value.charAt(0).toUpperCase() + value.slice(1);
    default:
      return value;
  }
}

export type TokenResolver = (token: TemplateToken) => string | undefined;

export type RenderResult = {
  text: string;
  missing: string[];
  tokens: TemplateToken[];
};

export function renderTemplate(
  template: string,
  resolve: TokenResolver
): RenderResult {
  const missing: string[] = [];
  const tokens: TemplateToken[] = [];
  let text = '';
  for (const part of parseTemplate(template)) {
    if (typeof part === 'string') {
      text += part;
      continue;
    }
    tokens.push(part);
    const value = resolve(part);
    if (value === undefined) {
      missing.push(part.raw);
      text += part.raw;
    } else {
      text += applyCasing(value, part.casing);
    }
  }
  return { text: tidy(text), missing, tokens };
}

/** Collapse whitespace introduced by empty substitutions. */
export function tidy(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .trim();
}

export function templateTokens(template: string): TemplateToken[] {
  return parseTemplate(template).filter(
    (p): p is TemplateToken => typeof p !== 'string'
  );
}
