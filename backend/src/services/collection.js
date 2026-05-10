const COLLECTION_PREFIX = "nb_v2_";

export function collectionNameFromFileId(fileId) {
  return COLLECTION_PREFIX + fileId.replace(/[^a-zA-Z0-9]/g, "_");
}