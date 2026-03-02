type SyncSnapshot = {
  version: number;
  updated_at: string;
  source: string;
};

let currentVersion = 1;
let updatedAt = new Date().toISOString();
let source = 'bootstrap';

export const bumpSyncVersion = (changeSource: string) => {
  currentVersion += 1;
  updatedAt = new Date().toISOString();
  source = changeSource;
};

export const getSyncVersionSnapshot = (): SyncSnapshot => ({
  version: currentVersion,
  updated_at: updatedAt,
  source,
});
