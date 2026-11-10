type TestEvent = {
  type: string;
  data: {
    name: string;
    details?: { type?: string; error?: { message?: string; cause?: { message?: string } } };
    skip?: unknown;
    todo?: unknown;
  };
};

export default async function* jsonLinesReporter(source: AsyncIterable<TestEvent>) {
  for await (const event of source) {
    if ((event.type === 'test:pass' || event.type === 'test:fail') && event.data.details?.type !== 'suite') {
      const result = event.data.skip !== undefined || event.data.todo !== undefined
        ? 'skipped'
        : event.type === 'test:pass'
        ? 'green'
        : 'red';
      const error = event.data.details?.error;
      const message = error?.cause?.message ?? error?.message;
      yield `${JSON.stringify({ result, name: event.data.name, message })}\n`;
    }
  }
}
