export const initialCombobox = (value = "") => ({ value, items: [], open: false, active: -1, revision: 0, selected: null });
export function comboboxReducer(state, event) {
  switch (event.type) {
    case "type": return { ...initialCombobox(event.value), open: true, revision: state.revision + 1 };
    case "restore": return { ...initialCombobox(event.value), revision: state.revision + 1 };
    case "close": return { ...state, open: false, active: -1, revision: state.revision + 1 };
    case "results": return state.open && event.revision === state.revision ? { ...state, items: event.items, active: -1 } : state;
    case "arrow": return state.open && state.items.length ? { ...state, active: event.direction === 1 ? (state.active + 1) % state.items.length : state.active < 0 ? state.items.length - 1 : (state.active - 1 + state.items.length) % state.items.length } : state;
    case "select": return { ...state, value: event.item.label, selected: event.item, open: false, active: -1, revision: state.revision + 1 };
    default: return state; // Hover, provider updates and verification never edit text.
  }
}
export const enterTarget = (state) => state.open && state.active >= 0 ? state.items[state.active] : null;
export const inputPrivacy = {
  autoComplete: "off", autoCorrect: "off", autoCapitalize: "off", spellCheck: false,
  "data-lpignore": "true", "data-1p-ignore": "true", "data-form-type": "other",
};
