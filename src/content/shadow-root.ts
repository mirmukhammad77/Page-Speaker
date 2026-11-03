import { createRoot } from "react-dom/client";
import css from "../ui/styles.css?inline";

export const HOST_ATTRIBUTE = "data-page-speaker";
export function mountReader() {
  const host = document.createElement("div");
  host.setAttribute(HOST_ATTRIBUTE, "");
  // Inline !important properties protect the host itself from the page cascade.
  const properties: Record<string, string> = {
    all: "initial", position: "fixed", inset: "0", width: "auto", height: "auto",
    "z-index": "2147483647", "pointer-events": "none", display: "block",
    visibility: "visible", opacity: "1", transform: "none", isolation: "isolate",
    "font-family": "system-ui, sans-serif", "font-size": "14px", "line-height": "1.5",
    color: "#1d2433", direction: "ltr", "color-scheme": "light",
  };
  for (const [name, value] of Object.entries(properties)) host.style.setProperty(name, value, "important");
  const shadow = host.attachShadow({ mode: "open" });
  const styles = document.createElement("style");
  styles.textContent = css;
  const mount = document.createElement("div");
  shadow.append(styles, mount);
  document.documentElement.append(host);
  const root = createRoot(mount);
  return { host, shadow, root, dispose() { root.unmount(); host.remove(); } };
}
