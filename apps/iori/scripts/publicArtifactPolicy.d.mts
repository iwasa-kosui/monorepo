export const findPublicArtifactViolations: (input: {
  files: readonly { path: string; text: string }[];
}) => readonly string[];
