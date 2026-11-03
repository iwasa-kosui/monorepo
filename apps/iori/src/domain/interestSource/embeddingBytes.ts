const BYTES_PER_DIMENSION = 4;

export const float32ToBytes = (embedding: Float32Array): Uint8Array => {
  const bytes = new Uint8Array(embedding.length * BYTES_PER_DIMENSION);
  const view = new DataView(bytes.buffer);
  embedding.forEach((value, index) => view.setFloat32(index * BYTES_PER_DIMENSION, value, true));
  return bytes;
};

export const bytesToFloat32 = (input: ArrayBuffer | ArrayLike<number>): Float32Array => {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : Uint8Array.from(input);
  const view = new DataView(bytes.buffer);
  const embedding = new Float32Array(Math.floor(bytes.length / BYTES_PER_DIMENSION));
  for (let index = 0; index < embedding.length; index++) {
    embedding[index] = view.getFloat32(index * BYTES_PER_DIMENSION, true);
  }
  return embedding;
};
