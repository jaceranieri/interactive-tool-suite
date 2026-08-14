/**
 * Authoring Tools — Web Host (Google Apps Script)
 *
 * Serves each authoring tool's HTML page. This is a SEPARATE Apps Script
 * project from the storage backend (storage-backend.gs) — that project's
 * doGet() already handles the save/list/load API, and a project can only
 * have one doGet(), so hosting needs its own project.
 *
 * As more tools are migrated (Tabbed Container, Worked Example, the hub),
 * add them to the PAGES map below and upload their .html file the same
 * way AnimatedSlides.html was set up.
 *
 * Deploy as a Web App:
 *   Execute as: Me
 *   Who has access: Anyone within [your institution] — this is a normal
 *     page load (not a background fetch), so domain-restricted access
 *     works reliably here, unlike the storage backend's API calls.
 */

// Each entry's `file` must match an HTML file's exact name in this
// project. `title`/`description`/`status` are shown on the hub page —
// the hub reads straight from this object, so there's no separate
// manifest file to remember to keep in sync when a tool is added here.
const PAGES = {
  'animated-slides': {
    file: 'AnimatedSlides', title: 'Animated Slides',
    description: 'Build slide-based interactives with elements that animate into position across slides.',
    status: 'stable',
  },
  'animated-slides-v2': {
    file: 'AnimatedSlidesV2', title: 'Animated Slides (v2)',
    description: 'Rebuilt engine — undo/redo, layers, and a redesigned nav bar. In testing.',
    status: 'beta',
  },
  'tabbed-panels': {
    file: 'TabbedPanels', title: 'Tabbed Panels',
    description: 'Build tabbed content with headings, text, lists, and linking buttons.',
    status: 'in development',
  },
  // 'toggle-slides': { file: 'ToggleSlides', title: 'Toggle Slides', description: 'A single canvas where nav buttons independently toggle groups of elements on and off.', status: 'in development' },  <- removed 2026-08-14, didn't meet requirements, see CLAUDE.md
  // 'tabbed-container': { file: 'TabbedContainer', title: 'Tabbed Container', description: '...', status: 'stable' },  <- add once migrated
  // 'worked-example': { file: 'WorkedExample', title: 'Worked Example', description: '...', status: 'stable' },        <- add once migrated
};

function doGet(e) {
  const page = (e.parameter.page || 'hub').toLowerCase();
  const baseUrl = ScriptApp.getService().getUrl();

  if (page === 'hub') {
    const template = HtmlService.createTemplateFromFile('Hub');
    template.baseUrl = baseUrl;
    template.toolsJson = JSON.stringify(
      Object.entries(PAGES).map(([id, meta]) => ({
        id, title: meta.title, description: meta.description, status: meta.status,
      }))
    );
    return template.evaluate()
      .setTitle('Authoring Tools')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const entry = PAGES[page];
  if (!entry) {
    return HtmlService.createHtmlOutput(
      `<p>Unknown tool: "${page}". Available: ${Object.keys(PAGES).join(', ')}</p>`
    );
  }

  const template = HtmlService.createTemplateFromFile(entry.file);
  template.baseUrl = baseUrl; // every tool's "back to hub" link uses this
  // Pulled from Script Properties rather than hardcoded in each tool's
  // HTML — nothing to hand-paste when a tool file gets regenerated.
  template.storageApiKey = PropertiesService.getScriptProperties().getProperty('STORAGE_API_KEY') || '';
  return template.evaluate()
    .setTitle('Authoring Tools')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Used by the scriptlets inside each tool's HTML — e.g.
 * <?!= include('DesignTokens'); ?> — to pull in the shared CSS/JS files.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * STORAGE API — called via google.script.run from storage-connector.js
 * whenever a tool is running inside a page served by this project. This
 * avoids fetch()/CORS entirely, which is what the separate
 * storage-backend.gs Web App runs into when called from an Apps-Script-
 * hosted page. storage-backend.gs is still useful for local/offline
 * testing (e.g. storage-test-harness.html), but real deployed tools use
 * these functions instead.
 *
 * One-time setup, same as storage-backend.gs:
 *   1. Script Properties: add GITHUB_TOKEN (a fine-grained PAT, Contents:
 *      Read and write, scoped to just this repo).
 *   2. Set GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH below.
 */

const GITHUB_OWNER = 'jasonranieri';
const GITHUB_REPO = 'interactive-tool-suite';
const GITHUB_BRANCH = 'main';

function apiSaveProject(tool, name, content, folder) {
  if (!tool || !name) throw new Error('Missing tool or name');
  const path = `${projectDir(tool, folder)}/${sanitize(name)}.json`;
  const existingSha = ghGetFileSha(path);

  const payload = {
    message: `Save "${name}" (${tool}) — ${new Date().toISOString()}`,
    content: Utilities.base64Encode(JSON.stringify(content, null, 2)),
    branch: GITHUB_BRANCH,
  };
  if (existingSha) payload.sha = existingSha;

  const resp = ghRequest('PUT', `contents/${path}`, payload);
  if (resp.getResponseCode() >= 300) {
    throw new Error('GitHub save failed: ' + resp.getContentText());
  }
  return { ok: true };
}

// Returns both the .json project files and the subfolders at this level,
// so a tool's Open modal can render one flat browsable listing per folder
// rather than needing a separate "list folders" round trip.
function apiListProjects(tool, folder) {
  if (!tool) throw new Error('Missing tool');
  const resp = ghRequest('GET', `contents/${projectDir(tool, folder)}`);
  if (resp.getResponseCode() === 404) return { projects: [], folders: [] }; // folder doesn't exist yet — fine
  if (resp.getResponseCode() >= 300) {
    throw new Error('GitHub list failed: ' + resp.getContentText());
  }
  const entries = JSON.parse(resp.getContentText());
  const projects = entries
    .filter(f => f.type === 'file' && f.name.endsWith('.json'))
    .map(f => ({ name: f.name.replace(/\.json$/, '') }));
  const folders = entries
    .filter(f => f.type === 'dir')
    .map(f => ({ name: f.name }));
  return { projects, folders };
}

function apiLoadProject(tool, name, folder) {
  if (!tool || !name) throw new Error('Missing tool or name');
  const path = `${projectDir(tool, folder)}/${sanitize(name)}.json`;
  const resp = ghRequest('GET', `contents/${path}`);
  if (resp.getResponseCode() >= 300) {
    throw new Error('GitHub load failed: ' + resp.getContentText());
  }
  const file = JSON.parse(resp.getContentText());
  const raw = Utilities.newBlob(Utilities.base64Decode(file.content)).getDataAsString();
  return { content: JSON.parse(raw) };
}

function apiDeleteProject(tool, name, folder) {
  if (!tool || !name) throw new Error('Missing tool or name');
  const path = `${projectDir(tool, folder)}/${sanitize(name)}.json`;
  const sha = ghGetFileSha(path);
  if (!sha) throw new Error('Project not found');
  const resp = ghRequest('DELETE', `contents/${path}`, {
    message: `Delete "${name}" (${tool}) — ${new Date().toISOString()}`,
    sha: sha,
    branch: GITHUB_BRANCH,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('GitHub delete failed: ' + resp.getContentText());
  }
  return { ok: true };
}

/**
 * GitHub's Contents API has no native "rename" — this creates the file
 * under the new name (carrying over the existing base64 content as-is, no
 * need to decode/re-encode it) and then removes the old one. If the
 * create step fails, nothing is deleted, so a failed rename never loses
 * the original. Renames stay within the same folder — see apiMoveProject
 * for moving a project between folders.
 */
function apiRenameProject(tool, oldName, newName, folder) {
  if (!tool || !oldName || !newName) throw new Error('Missing tool, name, or newName');
  const dir = projectDir(tool, folder);
  const oldPath = `${dir}/${sanitize(oldName)}.json`;
  const newPath = `${dir}/${sanitize(newName)}.json`;

  const oldResp = ghRequest('GET', `contents/${oldPath}`);
  if (oldResp.getResponseCode() >= 300) {
    throw new Error('Rename failed (could not read original): ' + oldResp.getContentText());
  }
  const oldFile = JSON.parse(oldResp.getContentText());

  const existingAtNewPath = ghGetFileSha(newPath); // only set if newName already exists — makes this an overwrite, not a create
  const createPayload = {
    message: `Rename "${oldName}" to "${newName}" (${tool}) — ${new Date().toISOString()}`,
    content: oldFile.content,
    branch: GITHUB_BRANCH,
  };
  if (existingAtNewPath) createPayload.sha = existingAtNewPath;

  const createResp = ghRequest('PUT', `contents/${newPath}`, createPayload);
  if (createResp.getResponseCode() >= 300) {
    throw new Error('Rename failed (could not create new file): ' + createResp.getContentText());
  }

  const deleteResp = ghRequest('DELETE', `contents/${oldPath}`, {
    message: `Remove old name after rename to "${newName}" (${tool})`,
    sha: oldFile.sha,
    branch: GITHUB_BRANCH,
  });
  if (deleteResp.getResponseCode() >= 300) {
    throw new Error('Renamed, but could not remove the old file: ' + deleteResp.getContentText());
  }

  return { ok: true };
}

/**
 * Moves a project between folders (including in/out of the root). Same
 * create-then-delete pattern as apiRenameProject, just varying the
 * directory instead of the filename.
 */
function apiMoveProject(tool, name, fromFolder, toFolder) {
  if (!tool || !name) throw new Error('Missing tool or name');
  const oldPath = `${projectDir(tool, fromFolder)}/${sanitize(name)}.json`;
  const newPath = `${projectDir(tool, toFolder)}/${sanitize(name)}.json`;
  if (oldPath === newPath) return { ok: true };

  const oldResp = ghRequest('GET', `contents/${oldPath}`);
  if (oldResp.getResponseCode() >= 300) {
    throw new Error('Move failed (could not read original): ' + oldResp.getContentText());
  }
  const oldFile = JSON.parse(oldResp.getContentText());

  const existingAtNewPath = ghGetFileSha(newPath);
  const createPayload = {
    message: `Move "${name}" (${tool}) to "${toFolder || '/'}" — ${new Date().toISOString()}`,
    content: oldFile.content,
    branch: GITHUB_BRANCH,
  };
  if (existingAtNewPath) createPayload.sha = existingAtNewPath;

  const createResp = ghRequest('PUT', `contents/${newPath}`, createPayload);
  if (createResp.getResponseCode() >= 300) {
    throw new Error('Move failed (could not create at destination): ' + createResp.getContentText());
  }

  const deleteResp = ghRequest('DELETE', `contents/${oldPath}`, {
    message: `Remove original after move (${tool})`,
    sha: oldFile.sha,
    branch: GITHUB_BRANCH,
  });
  if (deleteResp.getResponseCode() >= 300) {
    throw new Error('Moved, but could not remove the original: ' + deleteResp.getContentText());
  }

  return { ok: true };
}

// GitHub has no real, empty directories — a folder only exists as long as
// it contains at least one file. This creates a placeholder .gitkeep so a
// newly-made, still-empty folder shows up in apiListProjects right away.
function apiCreateFolder(tool, folder) {
  if (!tool || !folder) throw new Error('Missing tool or folder');
  const path = `${projectDir(tool, folder)}/.gitkeep`;
  if (ghGetFileSha(path)) return { ok: true }; // already exists
  const resp = ghRequest('PUT', `contents/${path}`, {
    message: `Create folder "${folder}" (${tool}) — ${new Date().toISOString()}`,
    content: Utilities.base64Encode(''),
    branch: GITHUB_BRANCH,
  });
  if (resp.getResponseCode() >= 300) {
    throw new Error('Create folder failed: ' + resp.getContentText());
  }
  return { ok: true };
}

// Recursively deletes every file under the folder (including nested
// subfolders and their .gitkeep placeholders) — once a directory has no
// files left in it, GitHub stops listing it at all, so there's no
// separate "delete the directory itself" step.
function apiDeleteFolder(tool, folder) {
  if (!tool || !folder) throw new Error('Missing tool or folder');
  deleteFolderContents(projectDir(tool, folder));
  return { ok: true };
}

function deleteFolderContents(dirPath) {
  const resp = ghRequest('GET', `contents/${dirPath}`);
  if (resp.getResponseCode() === 404) return;
  if (resp.getResponseCode() >= 300) {
    throw new Error('Could not read folder to delete: ' + resp.getContentText());
  }
  const entries = JSON.parse(resp.getContentText());
  entries.forEach(entry => {
    if (entry.type === 'dir') {
      deleteFolderContents(`${dirPath}/${entry.name}`);
    } else {
      const delResp = ghRequest('DELETE', `contents/${dirPath}/${entry.name}`, {
        message: `Delete "${entry.name}" as part of folder removal`,
        sha: entry.sha,
        branch: GITHUB_BRANCH,
      });
      if (delResp.getResponseCode() >= 300) {
        throw new Error(`Could not delete ${entry.name}: ` + delResp.getContentText());
      }
    }
  });
}

/* ---- GitHub helpers ---- */

function ghGetFileSha(path) {
  const resp = ghRequest('GET', `contents/${path}`);
  if (resp.getResponseCode() >= 300) return null; // doesn't exist yet — first save will create it
  return JSON.parse(resp.getContentText()).sha;
}

function ghRequest(method, path, body) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  const options = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
    muteHttpExceptions: true,
  };
  if (body) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }
  return UrlFetchApp.fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/${path}`,
    options
  );
}

function sanitize(name) {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');
}

// A folder path is a '/'-separated list of segments (nested folders
// supported); each segment goes through the same sanitize() a project
// name does. Empty/undefined folder means the tool's root.
function sanitizePath(folder) {
  if (!folder) return '';
  return String(folder).split('/').map(s => s.trim()).filter(Boolean).map(sanitize).join('/');
}

function projectDir(tool, folder) {
  const f = sanitizePath(folder);
  return f ? `projects/${tool}/${f}` : `projects/${tool}`;
}
