import { registerObservedAssets } from '../domain/asset-catalog.js';
// Preserve ordered mutations and version conflicts independently of DOM rendering.
export function createWorkspaceClient({ onState, redraw, notify }) {
  let state;
  let queue = Promise.resolve();

  async function load() {
    const response = await fetch("/api/workspace");
    if (!response.ok) throw new Error("工作台草稿读取失败");
    const json = await response.json();
    registerObservedAssets(json.assets || []);
    state = json.workspace;
    onState(state);
  }

  function mutate(action, repaint = true) {
    const result = queue.then(async () => {
      const response = await fetch("/api/workspace", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...action, version: state.version }),
      });
      const json = await response.json();
      if (json.workspace) {
        state = json.workspace;
        onState(state);
      }
      if (!json.ok) throw new Error(json.message);
      if (repaint) redraw();
      return true;
    });
    queue = result.catch((error) => {
      notify(error.message, "error");
      return false;
    });
    return queue;
  }

  return { load, mutate, settled: () => queue };
}
