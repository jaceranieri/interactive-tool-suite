/**
 * Authoring Tools — Storage Backend (Google Apps Script)
 *
 * Deploy this as a Web App:
 *   Deploy > New deployment > Web app
 *   Execute as: Me
 *   Who has access: Anyone within [your institution] — not "Anyone",
 *     to keep this off the open internet.
 *
 * One-time setup:
 *   1. Create a GitHub fine-grained personal access token scoped to ONLY
 *      this repo, with "Contents: Read and write" permission.
 *   2. In this Apps Script project: Project Settings > Script Properties
 *      > add GITHUB_TOKEN = <the token>.
 *   3. Also add a Script Property API_KEY = <a long random string you make
 *      up yourself — this is what stops the endpoint being genuinely open,
 *      since deployment access must be set to "Anyone" for fetch() calls
 *      from your tools to work at all>.
 *   4. Set GITHUB_OWNER / GITHUB_REPO / GITHUB_BRANCH below.
 *   5. Deploy as a Web App — Execute as: Me, Who has access: Anyone.
 *   6. Copy the deployed Web App URL and the API_KEY into
 *      Storage.configure(url, apiKey) in every tool.
 *
 * Every project is stored as one JSON file at:
 *   projects/{tool}/{sanitised project name}.json
 * Saving again under the same name/tool is a normal GitHub update — it
 * creates a new commit on the same file, so the full history and every
 * previous version stay available in git, with no extra work.
 */

const GITHUB_OWNER = 'your-org-or-username';
const GITHUB_REPO = 'authoring-tools';
const GITHUB_BRANCH = 'main';

function doPost(e) {
  const p = e.parameter; // form-encoded params, not a JSON body
  if (!checkAuth(p.key)) return json({ error: 'Unauthorized' });
  if (p.action === 'save') {
    let content;
    try {
      content = JSON.parse(p.content);
    } catch (err) {
      return json({ error: 'Content was not valid JSON' });
    }
    return json(saveProject(p.tool, p.name, content, p.folder));
  }
  if (p.action === 'delete') return json(deleteProject(p.tool, p.name, p.folder));
  if (p.action === 'rename') return json(renameProject(p.tool, p.name, p.newName, p.folder));
  if (p.action === 'move') return json(moveProject(p.tool, p.name, p.folder, p.toFolder));
  if (p.action === 'createFolder') return json(createFolder(p.tool, p.folder));
  if (p.action === 'deleteFolder') return json(deleteFolder(p.tool, p.folder));
  return json({ error: 'Unknown action' });
}

function doGet(e) {
  if (!checkAuth(e.parameter.key)) return json({ error: 'Unauthorized' });
  const action = e.parameter.action;
  const tool = e.parameter.tool;
  if (action === 'list') return json(listProjects(tool, e.parameter.folder));
  if (action === 'load') return json(loadProject(tool, e.parameter.name, e.parameter.folder));
  return json({ error: 'Unknown action' });
}

function checkAuth(key) {
  const expected = PropertiesService.getScriptProperties().getProperty('API_KEY');
  return !!expected && key === expected;
}

function saveProject(tool, name, content, folder) {
  if (!tool || !name) return { error: 'Missing tool or name' };
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
    return { error: 'GitHub save failed', detail: resp.getContentText() };
  }
  return { ok: true };
}

function listProjects(tool, folder) {
  if (!tool) return { error: 'Missing tool' };
  const resp = ghRequest('GET', `contents/${projectDir(tool, folder)}`);
  if (resp.getResponseCode() === 404) return { projects: [], folders: [] }; // folder doesn't exist yet — that's fine
  if (resp.getResponseCode() >= 300) {
    return { error: 'GitHub list failed', detail: resp.getContentText() };
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

function loadProject(tool, name, folder) {
  if (!tool || !name) return { error: 'Missing tool or name' };
  const path = `${projectDir(tool, folder)}/${sanitize(name)}.json`;
  const resp = ghRequest('GET', `contents/${path}`);
  if (resp.getResponseCode() >= 300) {
    return { error: 'GitHub load failed', detail: resp.getContentText() };
  }
  const file = JSON.parse(resp.getContentText());
  const raw = Utilities.newBlob(Utilities.base64Decode(file.content)).getDataAsString();
  return { content: JSON.parse(raw) };
}

function deleteProject(tool, name, folder) {
  if (!tool || !name) return { error: 'Missing tool or name' };
  const path = `${projectDir(tool, folder)}/${sanitize(name)}.json`;
  const sha = ghGetFileSha(path);
  if (!sha) return { error: 'Project not found' };
  const resp = ghRequest('DELETE', `contents/${path}`, {
    message: `Delete "${name}" (${tool}) — ${new Date().toISOString()}`,
    sha: sha,
    branch: GITHUB_BRANCH,
  });
  if (resp.getResponseCode() >= 300) {
    return { error: 'GitHub delete failed', detail: resp.getContentText() };
  }
  return { ok: true };
}

function renameProject(tool, oldName, newName, folder) {
  if (!tool || !oldName || !newName) return { error: 'Missing tool, name, or newName' };
  const dir = projectDir(tool, folder);
  const oldPath = `${dir}/${sanitize(oldName)}.json`;
  const newPath = `${dir}/${sanitize(newName)}.json`;

  const oldResp = ghRequest('GET', `contents/${oldPath}`);
  if (oldResp.getResponseCode() >= 300) {
    return { error: 'Rename failed (could not read original)', detail: oldResp.getContentText() };
  }
  const oldFile = JSON.parse(oldResp.getContentText());

  const existingAtNewPath = ghGetFileSha(newPath);
  const createPayload = {
    message: `Rename "${oldName}" to "${newName}" (${tool}) — ${new Date().toISOString()}`,
    content: oldFile.content,
    branch: GITHUB_BRANCH,
  };
  if (existingAtNewPath) createPayload.sha = existingAtNewPath;

  const createResp = ghRequest('PUT', `contents/${newPath}`, createPayload);
  if (createResp.getResponseCode() >= 300) {
    return { error: 'Rename failed (could not create new file)', detail: createResp.getContentText() };
  }

  const deleteResp = ghRequest('DELETE', `contents/${oldPath}`, {
    message: `Remove old name after rename to "${newName}" (${tool})`,
    sha: oldFile.sha,
    branch: GITHUB_BRANCH,
  });
  if (deleteResp.getResponseCode() >= 300) {
    return { error: 'Renamed, but could not remove the old file', detail: deleteResp.getContentText() };
  }

  return { ok: true };
}

function moveProject(tool, name, fromFolder, toFolder) {
  if (!tool || !name) return { error: 'Missing tool or name' };
  const oldPath = `${projectDir(tool, fromFolder)}/${sanitize(name)}.json`;
  const newPath = `${projectDir(tool, toFolder)}/${sanitize(name)}.json`;
  if (oldPath === newPath) return { ok: true };

  const oldResp = ghRequest('GET', `contents/${oldPath}`);
  if (oldResp.getResponseCode() >= 300) {
    return { error: 'Move failed (could not read original)', detail: oldResp.getContentText() };
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
    return { error: 'Move failed (could not create at destination)', detail: createResp.getContentText() };
  }

  const deleteResp = ghRequest('DELETE', `contents/${oldPath}`, {
    message: `Remove original after move (${tool})`,
    sha: oldFile.sha,
    branch: GITHUB_BRANCH,
  });
  if (deleteResp.getResponseCode() >= 300) {
    return { error: 'Moved, but could not remove the original', detail: deleteResp.getContentText() };
  }

  return { ok: true };
}

function createFolder(tool, folder) {
  if (!tool || !folder) return { error: 'Missing tool or folder' };
  const path = `${projectDir(tool, folder)}/.gitkeep`;
  if (ghGetFileSha(path)) return { ok: true };
  const resp = ghRequest('PUT', `contents/${path}`, {
    message: `Create folder "${folder}" (${tool}) — ${new Date().toISOString()}`,
    content: Utilities.base64Encode(''),
    branch: GITHUB_BRANCH,
  });
  if (resp.getResponseCode() >= 300) {
    return { error: 'Create folder failed', detail: resp.getContentText() };
  }
  return { ok: true };
}

function deleteFolder(tool, folder) {
  if (!tool || !folder) return { error: 'Missing tool or folder' };
  const err = deleteFolderContents(projectDir(tool, folder));
  if (err) return err;
  return { ok: true };
}

function deleteFolderContents(dirPath) {
  const resp = ghRequest('GET', `contents/${dirPath}`);
  if (resp.getResponseCode() === 404) return null;
  if (resp.getResponseCode() >= 300) {
    return { error: 'Could not read folder to delete', detail: resp.getContentText() };
  }
  const entries = JSON.parse(resp.getContentText());
  for (const entry of entries) {
    if (entry.type === 'dir') {
      const err = deleteFolderContents(`${dirPath}/${entry.name}`);
      if (err) return err;
    } else {
      const delResp = ghRequest('DELETE', `contents/${dirPath}/${entry.name}`, {
        message: `Delete "${entry.name}" as part of folder removal`,
        sha: entry.sha,
        branch: GITHUB_BRANCH,
      });
      if (delResp.getResponseCode() >= 300) {
        return { error: `Could not delete ${entry.name}`, detail: delResp.getContentText() };
      }
    }
  }
  return null;
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

function sanitizePath(folder) {
  if (!folder) return '';
  return String(folder).split('/').map(s => s.trim()).filter(Boolean).map(sanitize).join('/');
}

function projectDir(tool, folder) {
  const f = sanitizePath(folder);
  return f ? `projects/${tool}/${f}` : `projects/${tool}`;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
