import type { FocusEvent, MouseEvent } from "react";

function handleFocus(event: FocusEvent<HTMLInputElement>) {
  event.target.select();
}

function handleMouseDown(event: MouseEvent<HTMLInputElement>) {
  const input = event.currentTarget;
  if (document.activeElement !== input) {
    // This mousedown is what's about to focus the field — take over so the
    // native "place the cursor at the click position" behavior doesn't
    // immediately collapse the selection the focus handler is about to
    // make. `preventDefault` suppresses that native focus-and-place, so we
    // trigger focus manually; the `focus` handler below then selects all.
    event.preventDefault();
    input.focus();
  }
  // Already focused: let the click behave normally so the user can
  // position the cursor or edit in place.
}

/**
 * Spread onto a text `<input>` to select its entire value whenever it's
 * newly focused — by click or by Tab — so "click a populated field, type"
 * replaces the old value instead of requiring a manual select/delete
 * first. A second click inside an already-focused input still places the
 * cursor normally: only the mousedown that *causes* focus is special-cased.
 */
export const selectAllOnFocus = {
  onFocus: handleFocus,
  onMouseDown: handleMouseDown,
};
