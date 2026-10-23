/**
 * The comparable form of a ceremony's meeting link (`Ceremony.meetingUrl`):
 * host and path, lowercased, without scheme, `www.`, query, fragment or
 * trailing slash. So `https://talk.syntro.fi/rooms/Standup/` and
 * `talk.syntro.fi/rooms/standup?pwd=x` are the same room. Returns null when
 * the value is not a link with a host and a path, since a bare host would
 * match every room on that server.
 */
export function meetingUrlKey(raw: string): string | null {
  const value = raw.trim();
  if (value === "") return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") && host !== "localhost") return null;
  const path = decodeURIComponentSafe(url.pathname).toLowerCase().replace(/\/+$/, "");
  if (path === "") return null;
  const port = url.port ? `:${url.port}` : "";
  return `${host}${port}${path}`;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
