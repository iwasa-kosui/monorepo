type TestEvent = { type: string; data: { name: string; details?: { type?: string }; skip?: unknown; todo?: unknown } };

export default async function* jsonLinesReporter(source: AsyncIterable<TestEvent>) {
  for await (const event of source) {
    if ((event.type === 'test:pass' || event.type === 'test:fail') && event.data.details?.type !== 'suite') {
      const result = event.data.skip !== undefined || event.data.todo !== undefined
        ? 'skipped'
        : event.type === 'test:pass'
        ? 'green'
        : 'red';
      yield `${JSON.stringify({ result, name: event.data.name })}\n`;
    }
  }
}
