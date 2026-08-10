/* ==========================================================================
   Authoring Tools — Shared Storage Connector (client side)

   Auto-detects its environment:
   - Hosted inside an Apps Script page (google.script.run available): calls
     server-side functions (apiSaveProject/apiListProjects/apiLoadProject)
     directly. No CORS involved at all — this is the path real deployed
     tools use.
   - Anywhere else (e.g. the local test harness): falls back to fetch()
     against a separately deployed storage-backend.gs Web App.

   Usage in a tool (identical either way):
     Storage.configure('https://script.google.com/macros/s/XXXX/exec', 'your-api-key');
     await Storage.saveProject('canvas-builder', 'My Project', { slides });
     const { projects } = await Storage.listProjects('canvas-builder');
     const { content } = await Storage.loadProject('canvas-builder', 'My Project');
   ========================================================================== */

const Storage = (() => {
  let endpoint = null;
  let apiKey = null;
  const isAppsScriptHosted = (typeof google !== 'undefined' && google.script && google.script.run);

  function configure(url, key) {
    endpoint = url;
    apiKey = key;
  }

  function runRPC(fnName, ...args) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(resolve)
        .withFailureHandler((err) => reject(new Error((err && err.message) ? err.message : String(err))))
        [fnName](...args);
    });
  }

  // content: any JSON-serialisable object — each tool defines its own shape.
  // Saving under the same name again is a normal update, not an overwrite in
  // the old sense — it lands as a new commit on the same file, so history
  // is preserved automatically.
  //
  // `folder` (optional, defaults to '') is a '/'-separated path relative to
  // the tool's own projects/{tool}/ directory — '' means the tool's root,
  // same as before folders existed, so every call below still works
  // unchanged for a tool that never passes it.
  async function saveProject(tool, name, content, folder = '') {
    if (isAppsScriptHosted) return runRPC('apiSaveProject', tool, name, content, folder);
    return request('POST', { action: 'save', tool, name, content: JSON.stringify(content), folder, key: apiKey });
  }

  // Resolves to { projects: [{name}], folders: [{name}] } — the files and
  // subfolders that live directly inside `folder`.
  async function listProjects(tool, folder = '') {
    if (isAppsScriptHosted) return runRPC('apiListProjects', tool, folder);
    return request('GET', { action: 'list', tool, folder, key: apiKey });
  }

  async function loadProject(tool, name, folder = '') {
    if (isAppsScriptHosted) return runRPC('apiLoadProject', tool, name, folder);
    return request('GET', { action: 'load', tool, name, folder, key: apiKey });
  }

  async function deleteProject(tool, name, folder = '') {
    if (isAppsScriptHosted) return runRPC('apiDeleteProject', tool, name, folder);
    return request('POST', { action: 'delete', tool, name, folder, key: apiKey });
  }

  // GitHub has no native rename — this commits the content under the new
  // name and removes the old file, which is why it needs the content on
  // hand rather than just the two names. Stays within the same folder —
  // use moveProject to move a project between folders.
  async function renameProject(tool, oldName, newName, folder = '') {
    if (isAppsScriptHosted) return runRPC('apiRenameProject', tool, oldName, newName, folder);
    return request('POST', { action: 'rename', tool, name: oldName, newName, folder, key: apiKey });
  }

  // Moves an existing project into a different folder (or to/from the
  // root). Same create-then-delete approach as renameProject.
  async function moveProject(tool, name, fromFolder, toFolder) {
    if (isAppsScriptHosted) return runRPC('apiMoveProject', tool, name, fromFolder, toFolder);
    return request('POST', { action: 'move', tool, name, folder: fromFolder, toFolder, key: apiKey });
  }

  // Creates an (initially empty) folder so it shows up in listProjects
  // right away, without needing a project saved into it first.
  async function createFolder(tool, folder) {
    if (isAppsScriptHosted) return runRPC('apiCreateFolder', tool, folder);
    return request('POST', { action: 'createFolder', tool, folder, key: apiKey });
  }

  // Deletes a folder and everything in it (projects and any nested
  // subfolders) — irreversible, same as deleteProject.
  async function deleteFolder(tool, folder) {
    if (isAppsScriptHosted) return runRPC('apiDeleteFolder', tool, folder);
    return request('POST', { action: 'deleteFolder', tool, folder, key: apiKey });
  }

  async function request(method, params) {
    if (!endpoint) throw new Error('Storage.configure(url, apiKey) must be called before use.');
    let res;
    try {
      if (method === 'GET') {
        const url = endpoint + '?' + new URLSearchParams(params).toString();
        res = await fetch(url, { method: 'GET' });
      } else {
        // Form-encoded body (not JSON) — more reliable through Apps
        // Script's internal redirect when called cross-origin.
        res = await fetch(endpoint, { method: 'POST', body: new URLSearchParams(params) });
      }
    } catch (networkErr) {
      throw new Error('Could not reach the storage backend — check your connection.');
    }
    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      let snippet = '';
      try { snippet = (await res.clone().text()).slice(0, 200); } catch (e2) { /* ignore */ }
      throw new Error(`Storage backend returned an unexpected response (HTTP ${res.status}): ${snippet || '(empty body)'}`);
    }
    if (data.error) {
      throw new Error(data.error + (data.detail ? `: ${data.detail}` : ''));
    }
    return data;
  }

  return { configure, saveProject, listProjects, loadProject, deleteProject, renameProject, moveProject, createFolder, deleteFolder };
})();
