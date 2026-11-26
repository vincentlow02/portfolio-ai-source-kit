import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

export type SelectionContext = { pagePath: string; text: string; sectionId: string | null };
type SelectionAction = { context: SelectionContext; rect: DOMRect };

const excluded = "a, button, nav, footer, form, input, textarea, select, [contenteditable], [hidden], [inert], [aria-hidden='true' i], [data-portfolio-access='protected']";

function containingElement(node: Node) {
  return node instanceof Element ? node : node.parentElement;
}

function readSelection(scope: Element, pagePath: string): SelectionAction | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const text = selection.toString().trim();
  if (text.length < 3 || text.length > 1200) return null;

  const range = selection.getRangeAt(0);
  const start = containingElement(range.startContainer);
  const end = containingElement(range.endContainer);
  if (!start || !end || !scope.contains(start) || !scope.contains(end) ||
      start.closest(excluded) || end.closest(excluded) ||
      Array.from(scope.querySelectorAll(excluded)).some(node => range.intersectsNode(node))) return null;

  const rect = range.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= window.innerHeight) return null;
  const section = start.closest("section[id]");
  const sectionId = section && section === end.closest("section[id]") ? section.id : null;
  return { context: { pagePath, text, sectionId }, rect };
}

export function usePortfolioSelection(
  portfolioRef: RefObject<HTMLDivElement | null>,
  scopeSelector: string | null,
  pathname: string,
) {
  const [action, setAction] = useState<SelectionAction | null>(null);
  const actionRef = useRef<HTMLButtonElement>(null);
  const dismiss = useCallback(() => setAction(null), []);

  useEffect(() => {
    const selectionInput = window.matchMedia("(any-pointer: fine), (any-pointer: none)");

    function update() {
      if (document.activeElement === actionRef.current) return;
      const scope = selectionInput.matches && scopeSelector
        ? portfolioRef.current?.querySelector(scopeSelector)
        : null;
      const privatePage = document.querySelector('[data-portfolio-access="protected"], input[type="password"]');
      const robots = document.querySelectorAll('meta[name="robots" i], meta[name="googlebot" i]');
      const noIndex = Array.from(robots).some(meta => /\b(?:noindex|none)\b/iu.test(meta.getAttribute("content") ?? ""));
      setAction(scope && !privatePage && !noIndex ? readSelection(scope, pathname) : null);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }

    dismiss();
    document.addEventListener("selectionchange", update);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    selectionInput.addEventListener("change", dismiss);
    return () => {
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      selectionInput.removeEventListener("change", dismiss);
    };
  }, [dismiss, pathname, portfolioRef, scopeSelector]);

  useLayoutEffect(() => {
    const button = actionRef.current;
    if (!action || !button) return;
    const { left, top, bottom, width } = action.rect;
    const x = left + (width - button.offsetWidth) / 2;
    const above = top - button.offsetHeight - 8;
    const y = above >= 8 ? above : bottom + 8;
    button.style.left = `${Math.max(8, Math.min(x, window.innerWidth - button.offsetWidth - 8))}px`;
    button.style.top = `${Math.max(8, Math.min(y, window.innerHeight - button.offsetHeight - 8))}px`;
  }, [action]);

  return { action, actionRef, dismiss };
}
