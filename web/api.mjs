import { toDataUri } from './dom.mjs';

async function json(response) {
    if (response.status === 401) location.reload();

    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? response.statusText);

    return body;
}

const get = (path) => fetch(path).then(json);
const post = (path, body) =>
    fetch(path, { body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, method: 'POST' }).then(
        json,
    );

export const api = {
    aiEdit: (parent, { input, instruction, kind, region }, title) =>
        post('/api/edits/ai', { input, instruction, kind, parent, region, title }),
    create: (prompt, title) => post('/api/create', { prompt, title }),
    logout: () => fetch('/api/session', { method: 'DELETE' }),
    manualEdit: (parent, edited, { description, kind, placed, region }, title) =>
        post('/api/edits/manual', { description, edited, kind, parent, placed, region, title }),
    videoEdit: (parent, { kind, width }, title) => post('/api/edits/video', { kind, parent, title, width }),
    provenance: (image, title) => post('/api/provenance', { image, title }),
    sample: async (name) => toDataUri(await (await fetch(`/api/samples/${encodeURIComponent(name)}`)).blob()),
    samples: () => get('/api/samples'),
    session: () => get('/api/session'),
    template: async (name) => (await fetch(`/api/templates/${encodeURIComponent(name)}`)).text(),
    templateEdit: (components, rendered, title) => post('/api/edits/template', { components, rendered, title }),
    templates: () => get('/api/templates'),
};
