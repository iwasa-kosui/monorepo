type TestEvent = { type: string; data: { name: string; details?: { type?: string } } };

export default async function* jsonLinesReporter(source: AsyncIterable<TestEvent>) {
  for await (const event of source) {
    if ((event.type === 'test:pass' || event.type === 'test:fail') && event.data.details?.type !== 'suite') {
      yield `${JSON.stringify({ result: event.type === 'test:pass' ? 'green' : 'red', name: event.data.name })}\n`;
    }
  }
}
