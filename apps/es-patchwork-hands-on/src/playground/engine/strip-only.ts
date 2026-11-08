const mask = (source: string, keepStrings: boolean): string => {
  let output = '';
  let index = 0;
  const blank = (text: string): string => text.replace(/[^\n]/g, ' ');
  while (index < source.length) {
    const char = source[index] ?? '';
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      output += blank(source.slice(index, stop));
      index = stop;
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      output += blank(source.slice(index, stop));
      index = stop;
    } else if (char === '\'' || char === '"' || char === '`') {
      let stop = index + 1;
      while (stop < source.length && source[stop] !== char) {
        stop += source[stop] === '\\' ? 2 : 1;
      }
      stop = Math.min(stop + 1, source.length);
      const literal = source.slice(index, stop);
      output += keepStrings ? literal : `${char}${blank(literal.slice(1, -1))}${char}`;
      index = stop;
    } else {
      output += char;
      index += 1;
    }
  }
  return output;
};

const enumPattern = /(?:^|[\s;{}])(?:export\s+)?(?:declare\s+)?(?:const\s+)?enum\s+[A-Za-z_$][\w$]*\s*\{/;
const parameterPropertyPattern = /(?:^|,)\s*(?:(?:public|private|protected|readonly|override)\s+)+[A-Za-z_$]/;

const constructorParameters = (code: string): string[] => {
  const found: string[] = [];
  for (const match of code.matchAll(/\bconstructor\s*\(/g)) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < code.length && depth > 0) {
      const char = code[index];
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      index += 1;
    }
    found.push(code.slice(start, index - 1));
  }
  return found;
};

export const findUnsupportedSyntax = (source: string): string | undefined => {
  const code = mask(source, false);
  if (enumPattern.test(code)) {
    return 'TypeScript enum is not supported in strip-only mode';
  }
  if (constructorParameters(code).some((parameters) => parameterPropertyPattern.test(parameters))) {
    return 'TypeScript parameter property is not supported in strip-only mode';
  }
  return undefined;
};

const importPattern = /\bimport\s+(?!type\b)(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*(['"])(\.[^'"]*)\2/g;

export const namedValueImports = (source: string): { specifier: string; names: string[] }[] =>
  [...mask(source, true).matchAll(importPattern)].flatMap((match) => {
    const names = (match[1] ?? '')
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '' && !/^type\s/.test(part))
      .map((part) => part.split(/\s+as\s+/)[0] ?? '');
    return names.length === 0 ? [] : [{ specifier: match[3] ?? '', names }];
  });
