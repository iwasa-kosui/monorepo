const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const localUpload = new RegExp(`^/uploads/(${uuid})\\.(gif|jpeg|jpg|png|webp)$`, 'i');
const contentTypes = { gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const classifyUploadUrl = (url) => {
  if (typeof url !== 'string') return { kind: 'invalid' };
  const match = localUpload.exec(url);
  if (match !== null) {
    return {
      kind: 'local',
      uuid: match[1],
      filename: `${match[1]}.${match[2]}`,
      key: `post-images/${match[1]}/original`,
      contentType: contentTypes[match[2].toLowerCase()],
    };
  }
  if (/^https?:\/\//.test(url)) return { kind: 'remote' };
  if (url.startsWith('/static/uploads/')) return { kind: 'legacy' };
  return { kind: 'invalid' };
};

export const createUploadTracker = () => {
  const filenames = new Map();
  let rows = 0;
  return {
    add: (upload) => {
      rows += 1;
      const known = filenames.get(upload.key);
      if (known === undefined) {
        filenames.set(upload.key, upload.filename);
        return 'new';
      }
      return known === upload.filename ? 'duplicate' : 'conflict';
    },
    has: (key) => filenames.has(key),
    get uniqueCount() {
      return filenames.size;
    },
    get duplicateCount() {
      return rows - filenames.size;
    },
  };
};
