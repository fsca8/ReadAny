/**
 * Radix's Dialog stores the element that was focused when it opened
 * (`FocusScope`'s `previouslyFocusedElement` snapshot) and, on close, re-focuses it
 * from a `setTimeout(0)` — after React has already unmounted the dialog.
 *
 * That is normally what you want: focus returns to the trigger. It breaks when the
 * trigger is an element that triggers an action on focus (e.g. the book card, whose
 * `onClick` handler is replayed by the browser when a focused element receives Enter
 * / Space, or simply a focus-triggered handler). If the element still exists when
 * Radix restores focus, its handler fires a second time — which is how "the book is
 * deleted, then the confirm dialog pops up" happens.
 *
 * Call this synchronously right before closing such a dialog: it detaches the
 * focus-restore target so Radix's restore becomes a no-op (`?.` on a null value).
 * Uses `activeElement` rather than a ref because Radix controls focus inside the
 * dialog, so the trigger is not the active element at the moment the handler runs.
 */
export function blurActiveElement() {
  const active = document.activeElement;
  if (active instanceof HTMLElement) active.blur();
}
