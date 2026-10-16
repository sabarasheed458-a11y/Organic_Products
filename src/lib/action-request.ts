import type { ActionResult } from "@/types";
// Server Action business failures are handled on the server; transport failures
// reject before that response reaches the browser.
export async function actionRequest(
  task: () => Promise<ActionResult>,
): Promise<ActionResult> {
  try {
    return await task();
  } catch {
    return {
      ok: false,
      message: "The connection was interrupted. Please try again.",
    };
  }
}
