export type ImportVerificationPaths = {
  exportManifestPath: string;
  d1ImportManifestPath: string;
  r2ImportManifestPath: string;
  ogpImportManifestPath: string;
};

export function materializeImportVerificationInputs(input: {
  directory: string;
  exportManifestJson: string;
  d1ImportManifestJson: string;
  r2ImportManifestJson: string;
  ogpImportManifestJson: string;
  exportDataFilesJson: string;
}): Promise<ImportVerificationPaths>;
