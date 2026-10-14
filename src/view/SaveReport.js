/**
 * The toast decisions of the campaign writes in `app/campaignActions.js`.
 */

/**
 * The toast for one write, and whether a failure has been shown. An
 * automatic write (autosave or the combat flush) reports a failure once. The
 * next automatic failures stay quiet until a write lands, because a fight
 * flushes after every action and each flush fails the same way. A Save click
 * always shows its message.
 * @param {{ landed: boolean, message: string | null }} outcome from `saveOutcome`
 * @param {boolean} automatic
 * @param {boolean} failureShown whether an earlier automatic failure showed its toast
 * @returns {{ toast: { message: string, level: 'status' | 'error' } | null, failureShown: boolean }}
 */
export function saveToast({ landed, message }, automatic, failureShown) {
  const quiet = !landed && automatic && failureShown;
  return {
    toast: message && !quiet ? { message, level: landed ? 'status' : 'error' } : null,
    failureShown: !landed && (automatic || failureShown),
  };
}
