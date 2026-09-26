/**
 * Invisible field. A human never fills it. A form-stuffing bot often does.
 * Returns a reader; the caller emits honeypot when it is true.
 */
export function installHoneypot(root?: ParentNode): () => boolean {
  if (typeof document === "undefined") return () => false;
  const host = root ?? document.body;
  if (!host) return () => false;
  const input = document.createElement("input");
  input.type = "text";
  input.tabIndex = -1;
  input.autocomplete = "off";
  input.setAttribute("aria-hidden", "true");
  input.name = "tl_company_url";
  input.style.cssText = "position:absolute;left:-9999px;height:0;width:0;opacity:0;pointer-events:none";
  host.appendChild(input);
  return () => input.value.trim().length > 0;
}
