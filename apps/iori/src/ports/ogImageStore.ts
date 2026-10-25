export type OgImageStore = Readonly<{
  get: (key: string) => Promise<Response | undefined>;
  put: (
    input: Readonly<{
      key: string;
      body: ArrayBuffer | ArrayBufferView;
      contentType: string;
    }>,
  ) => Promise<void>;
}>;
