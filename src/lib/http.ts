import Soup from 'gi://Soup?version=3.0';

let session: Soup.Session | null = null;

/** The one HTTP session of Visor and its modules. Created on first use. */
export function httpSession(): Soup.Session {
  session ??= new Soup.Session({ timeout: 20, user_agent: 'Visor (GNOME Shell extension)' });
  return session;
}

/** Cancels everything that is still running and drops the session. */
export function disposeHttpSession(): void {
  session?.abort();
  session = null;
}
