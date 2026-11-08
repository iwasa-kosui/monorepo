export type InspectOptions = {
  readonly depth?: number;
  readonly breakLength?: number;
  readonly maxArrayLength?: number;
  readonly expanded?: boolean;
  readonly sorted?: boolean;
};

type Context = {
  depth: number;
  breakLength: number;
  maxArrayLength: number;
  expanded: boolean;
  sorted: boolean;
  indentationLvl: number;
  currentDepth: number;
  seen: unknown[];
};

const compact = 3;

const quoteString = (text: string): string => {
  let quote = '\'';
  if (text.includes('\'')) {
    if (!text.includes('"')) {
      quote = '"';
    } else if (!text.includes('`') && !text.includes('${')) {
      quote = '`';
    }
  }
  const escapes: Record<string, string> = {
    '\b': '\\b',
    '\t': '\\t',
    '\n': '\\n',
    '\f': '\\f',
    '\r': '\\r',
    '\\': '\\\\',
  };
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === quote) {
      out += `\\${char}`;
    } else if (escapes[char] !== undefined) {
      out += escapes[char];
    } else if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      out += `\\x${code.toString(16).toUpperCase().padStart(2, '0')}`;
    } else {
      out += char;
    }
  }
  return `${quote}${out}${quote}`;
};

const identifierKey = /^[a-zA-Z_][a-zA-Z_0-9]*$/;

const formatKey = (key: string | symbol): string => {
  if (typeof key === 'symbol') {
    return `[${key.toString()}]`;
  }
  return identifierKey.test(key) ? key : quoteString(key);
};

const formatPrimitive = (value: unknown): string | undefined => {
  switch (typeof value) {
    case 'string':
      return quoteString(value);
    case 'number':
      return Object.is(value, -0) ? '-0' : String(value);
    case 'bigint':
      return `${value}n`;
    case 'boolean':
    case 'undefined':
      return String(value);
    case 'symbol':
      return value.toString();
    default:
      return value === null ? 'null' : undefined;
  }
};

const constructorNameOf = (value: object): string | null => {
  let current: object | null = value;
  while (current !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(current, 'constructor');
    if (descriptor !== undefined && typeof descriptor.value === 'function' && descriptor.value.name !== '') {
      return descriptor.value.name;
    }
    current = Object.getPrototypeOf(current);
  }
  return null;
};

const prefixOf = (constructor: string | null, fallback: string, size?: number): string => {
  const sizeText = size === undefined ? '' : `(${size})`;
  if (constructor === null) {
    return `[${fallback}${sizeText}: null prototype] `;
  }
  return `${constructor}${sizeText} `;
};

const isBelowBreakLength = (ctx: Context, output: string[], start: number, base: string): boolean => {
  let totalLength = output.length + start;
  if (totalLength + output.length > ctx.breakLength) {
    return false;
  }
  for (const entry of output) {
    totalLength += entry.length;
    if (totalLength > ctx.breakLength) {
      return false;
    }
  }
  return base === '' || !base.includes('\n');
};

const reduceToSingleString = (
  ctx: Context,
  output: string[],
  base: string,
  braces: readonly [string, string],
  recurseTimes: number,
): string => {
  if (!ctx.expanded && ctx.currentDepth - recurseTimes < compact) {
    const start = output.length + ctx.indentationLvl + braces[0].length + base.length + 10;
    if (isBelowBreakLength(ctx, output, start, base)) {
      const joined = output.join(', ');
      if (!joined.includes('\n')) {
        return `${base === '' ? '' : `${base} `}${braces[0]} ${joined} ${braces[1]}`;
      }
    }
  }
  const indentation = `\n${' '.repeat(ctx.indentationLvl)}`;
  return `${base === '' ? '' : `${base} `}${braces[0]}${indentation}  ${
    output.join(`,${indentation}  `)
  }${indentation}${braces[1]}`;
};

const formatNested = (ctx: Context, value: unknown, recurseTimes: number): string => {
  ctx.indentationLvl += 2;
  const text = formatValue(ctx, value, recurseTimes);
  ctx.indentationLvl -= 2;
  return text;
};

const errorText = (error: Error): string => {
  const name = error.name === '' ? 'Error' : error.name;
  return error.message === '' ? name : `${name}: ${error.message}`;
};

const formatRaw = (ctx: Context, value: object, recurseTimes: number): string => {
  const constructor = Object.getPrototypeOf(value) === null ? null : constructorNameOf(value);
  const ownNames = ctx.sorted ? Object.keys(value).sort() : Object.keys(value);
  const keys: (string | symbol)[] = [
    ...ownNames,
    ...Object.getOwnPropertySymbols(value).filter((symbol) =>
      Object.prototype.propertyIsEnumerable.call(value, symbol)
    ),
  ];
  let base = '';
  let braces: [string, string] = ['{', '}'];
  let formatter: ((level: number) => string[]) | undefined;
  let extraKeys = keys;
  const isTyped = ArrayBuffer.isView(value) && !(value instanceof DataView);

  if (Array.isArray(value)) {
    const prefix = constructor !== 'Array' ? prefixOf(constructor, 'Array', value.length) : '';
    braces = [`${prefix}[`, ']'];
    extraKeys = keys.filter((key) => typeof key === 'symbol' || !/^\d+$/.test(key));
    if (value.length === 0 && extraKeys.length === 0) {
      return `${braces[0]}]`;
    }
    formatter = (level) => {
      const limit = Math.min(ctx.maxArrayLength, value.length);
      const output: string[] = [];
      for (let index = 0; index < limit; index += 1) {
        output.push(
          index in value ? formatNested(ctx, value[index], level) : '<1 empty item>',
        );
      }
      if (value.length > limit) {
        const remaining = value.length - limit;
        output.push(`... ${remaining} more item${remaining > 1 ? 's' : ''}`);
      }
      return output;
    };
  } else if (isTyped) {
    const typed = value as unknown as ArrayLike<number | bigint>;
    braces = [`${prefixOf(constructor, 'TypedArray', typed.length)}[`, ']'];
    extraKeys = keys.filter((key) => typeof key === 'symbol' || !/^\d+$/.test(key));
    if (typed.length === 0 && extraKeys.length === 0) {
      return `${braces[0]}]`;
    }
    formatter = () => {
      const limit = Math.min(ctx.maxArrayLength, typed.length);
      const output = Array.from({ length: limit }, (_, index) => formatPrimitive(typed[index]) ?? '');
      if (typed.length > limit) {
        const remaining = typed.length - limit;
        output.push(`... ${remaining} more item${remaining > 1 ? 's' : ''}`);
      }
      return output;
    };
  } else if (value instanceof Set) {
    const prefix = prefixOf(constructor, 'Set', value.size);
    if (value.size === 0 && keys.length === 0) {
      return `${prefix}{}`;
    }
    braces = [`${prefix}{`, '}'];
    formatter = (level) => [...value].map((entry) => formatNested(ctx, entry, level));
  } else if (value instanceof Map) {
    const prefix = prefixOf(constructor, 'Map', value.size);
    if (value.size === 0 && keys.length === 0) {
      return `${prefix}{}`;
    }
    braces = [`${prefix}{`, '}'];
    formatter = (level) =>
      [...value].map(([key, entry]) => `${formatNested(ctx, key, level)} => ${formatNested(ctx, entry, level)}`);
  } else if (value instanceof Date) {
    base = Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
    if (keys.length === 0) {
      return base;
    }
  } else if (value instanceof RegExp) {
    base = value.toString();
    if (keys.length === 0) {
      return base;
    }
  } else if (value instanceof Error) {
    base = errorText(value);
    extraKeys = keys.filter((key) => key !== 'cause');
    if (extraKeys.length === 0) {
      return base;
    }
  } else if (typeof value === 'function') {
    const name = (value as { name?: string }).name ?? '';
    const isClass = /^class[\s{]/.test(Function.prototype.toString.call(value));
    base = isClass
      ? `[class ${name === '' ? '(anonymous)' : name}]`
      : `[Function${name === '' ? ' (anonymous)' : `: ${name}`}]`;
    if (keys.length === 0) {
      return base;
    }
  } else if (value instanceof Promise) {
    braces = ['Promise {', '}'];
    formatter = () => ['<pending>'];
  } else {
    const prefix = constructor === 'Object' ? '' : prefixOf(constructor, 'Object');
    if (keys.length === 0) {
      return `${prefix}{}`;
    }
    braces = [`${prefix}{`, '}'];
  }

  if (recurseTimes > ctx.depth) {
    const name = constructor === null
      ? '[Object: null prototype]'
      : `[${Array.isArray(value) ? 'Array' : constructor}]`;
    return name;
  }

  const level = recurseTimes + 1;
  ctx.seen.push(value);
  ctx.currentDepth = level;
  const output = formatter === undefined ? [] : formatter(level);
  for (const key of extraKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const text = descriptor !== undefined && 'value' in descriptor
      ? formatNested(ctx, descriptor.value, level)
      : '[Getter]';
    output.push(`${formatKey(key)}: ${text}`);
  }
  ctx.seen.pop();
  return reduceToSingleString(ctx, output, base, braces, level);
};

const formatValue = (ctx: Context, value: unknown, recurseTimes: number): string => {
  const primitive = formatPrimitive(value);
  if (primitive !== undefined) {
    return primitive;
  }
  const object = value as object;
  if (ctx.seen.includes(object)) {
    return '[Circular *1]';
  }
  return formatRaw(ctx, object, recurseTimes);
};

export const inspect = (value: unknown, options: InspectOptions = {}): string =>
  formatValue(
    {
      depth: options.depth ?? 2,
      breakLength: options.breakLength ?? 80,
      maxArrayLength: options.maxArrayLength ?? 100,
      expanded: options.expanded ?? false,
      sorted: options.sorted ?? false,
      indentationLvl: 0,
      currentDepth: 0,
      seen: [],
    },
    value,
    0,
  );
