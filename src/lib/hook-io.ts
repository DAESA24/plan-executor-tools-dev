// hook-io.ts — Dev-time shim for PAI's ~/.claude/hooks/lib/hook-io.ts.
// At deploy time, this file is replaced by the PAI-shipped version (see
// design.md §9.1). Locally it provides the same exported API so unit tests
// and the dev CLI can run without a PAI install.

export interface HookInputBase {
  session_id?: string;
  transcript_path?: string;
  hook_event_name?: string;
  [key: string]: unknown;
}

export function readHookInput<T = HookInputBase>(timeoutMs = 500): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error('readHookInput: stdin timeout'));
    }, timeoutMs);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data) as T);
      } catch (err) {
        reject(err);
      }
    });
    process.stdin.on('error', (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
