const inMemoryState = {
  workers: [],
  fields: []
};

function createLocalProvider() {
  return {
    async getStatus() {
      return { ok: true, provider: "local" };
    },
    async listWorkers() {
      return inMemoryState.workers;
    },
    async listFields() {
      return inMemoryState.fields;
    }
  };
}

function createCloudProvider() {
  return {
    async getStatus() {
      return { ok: true, provider: "cloud-not-implemented" };
    },
    async listWorkers() {
      return [];
    },
    async listFields() {
      return [];
    }
  };
}

export function createDataProvider(kind) {
  if (kind === "cloud") return createCloudProvider();
  return createLocalProvider();
}
