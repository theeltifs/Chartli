const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

let _pin = '';

export function setPin(p) { _pin = p; }
export function getPin() { return _pin; }

async function request(method, path, opts = {}) {
  const { json, formData } = opts;
  const headers = { 'X-Chartli-PIN': _pin };
  const init = { method, headers };

  if (formData) {
    init.body = formData;
  } else if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  }

  const res = await fetch(`${BASE}${path}`, init);
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

export const api = {
  get(path, params) {
    const qs = params
      ? '?' + new URLSearchParams(
          Object.fromEntries(Object.entries(params).filter(([, v]) => v != null))
        )
      : '';
    return request('GET', path + qs);
  },
  post: (path, json) => request('POST', path, { json }),
  postForm: (path, formData) => request('POST', path, { formData }),
  patch: (path, json) => request('PATCH', path, { json }),
  delete: (path) => request('DELETE', path),
};
