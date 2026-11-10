import { test as fcTest } from '@fast-check/vitest';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { htmlToPlainText } from './htmlToPlainText.ts';

describe('htmlToPlainText', () => {
  it('removes script, style, noscript and template elements with their contents', () => {
    const html = '<p>a</p><script>alert(1)</script><style>p{}</style><noscript>n</noscript><template>t</template>b';
    expect(htmlToPlainText(html, 100)).toBe('a\nb');
  });

  it('removes comments', () => {
    expect(htmlToPlainText('a<!-- hidden <b>x</b> -->b', 100)).toBe('ab');
  });

  it('turns br and block closing tags into line breaks', () => {
    expect(htmlToPlainText('<h1>T</h1><p>a<br>b</p><ul><li>c</li><li>d</li></ul>', 100)).toBe('T\na\nb\nc\nd');
  });

  it('turns the closing tags of pre, lists, blockquote and table into line breaks', () => {
    expect(htmlToPlainText('<pre><code>x</code></pre>次の段落', 100)).toBe('x\n次の段落');
    expect(htmlToPlainText('<ul><li>a</li></ul>b', 100)).toBe('a\n\nb');
    expect(htmlToPlainText('<ol><li>a</li></ol>b', 100)).toBe('a\n\nb');
    expect(htmlToPlainText('<blockquote>a</blockquote>b', 100)).toBe('a\nb');
    expect(htmlToPlainText('<table><tr><td>a</td></tr></table>b', 100)).toBe('a\n\nb');
  });

  it('separates table cells with a space', () => {
    expect(htmlToPlainText('<td>a</td><td>b</td>', 100)).toBe('a b');
    expect(htmlToPlainText('<th>a</th><th>b</th>', 100)).toBe('a b');
  });

  it('turns hr into a line break', () => {
    expect(htmlToPlainText('a<hr>b', 100)).toBe('a\nb');
    expect(htmlToPlainText('a<hr/>b', 100)).toBe('a\nb');
  });

  it('strips the remaining tags', () => {
    expect(htmlToPlainText('<a href="https://example.com">link</a> <b>bold</b>', 100)).toBe('link bold');
  });

  it('decodes named and numeric entities', () => {
    expect(htmlToPlainText('&amp; &lt; &gt; &quot; &#39; &apos; a&nbsp;b &#65; &#x42; &#x1F600;', 100)).toBe(
      '& < > " \' \' a b A B \u{1F600}',
    );
  });

  it('decodes common named entities', () => {
    expect(
      htmlToPlainText('&hellip;&mdash;&ndash;&rsquo;&lsquo;&rdquo;&ldquo;&middot;&copy;&reg;&trade;&yen;&times;', 100),
    ).toBe('…—–’‘”“·©®™¥×');
  });

  it('keeps out-of-range numeric references as they are', () => {
    expect(htmlToPlainText('&#1114112; &#x110000; &#99999999999999999999;', 100)).toBe(
      '&#1114112; &#x110000; &#99999999999999999999;',
    );
  });

  it('collapses whitespace per line and limits blank lines to one', () => {
    expect(htmlToPlainText('  a   b  \n\n\n\n\n  c\t\td  ', 100)).toBe('a b\n\nc d');
  });

  it('cuts at maxChars without splitting surrogate pairs', () => {
    expect(htmlToPlainText('\u{1F600}\u{1F601}\u{1F602}', 2)).toBe('\u{1F600}\u{1F601}');
    expect(htmlToPlainText('abc', 0)).toBe('');
  });

  it('cuts a very long input to maxChars, whether it is astral or not', () => {
    expect(htmlToPlainText(`<p>${'a'.repeat(2_000_000)}</p>`, 5)).toBe('aaaaa');
    expect(htmlToPlainText('\u{1F600}'.repeat(1_000_000), 5)).toBe('\u{1F600}'.repeat(5));
    expect(htmlToPlainText(`${'\u{1F600}a'.repeat(100)}`, 150)).toBe('\u{1F600}a'.repeat(75));
  });

  fcTest.prop([fc.string(), fc.integer({ min: 0, max: 50 })])(
    'leaves no tag shape and respects maxChars',
    (text, maxChars) => {
      const html = text.replaceAll('&', '');
      const result = htmlToPlainText(html, maxChars);
      expect(result).not.toMatch(/<[^>]*>/);
      expect(Array.from(result).length).toBeLessThanOrEqual(maxChars);
    },
  );

  fcTest.prop([
    fc.array(
      fc.constantFrom('<p>', '</p>', '<br>', '<script>', '</script>', '<!--', '-->', '<b', '>', 'text', ' ', '\n'),
    ),
    fc.integer({ min: 0, max: 50 }),
  ])('leaves no tag shape in structured fragments', (parts, maxChars) => {
    const result = htmlToPlainText(parts.join(''), maxChars);
    expect(result).not.toMatch(/<[^>]*>/);
    expect(Array.from(result).length).toBeLessThanOrEqual(maxChars);
  });
});
