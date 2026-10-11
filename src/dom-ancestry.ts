/**
 * Whether `node` sits inside an element named `tagName`, looking through
 * shadow roots to their hosts. HA nests cards in several shadow trees, so
 * a plain parentElement walk stops at the first one.
 */
export function hasAncestor(node: Node, tagName: string): boolean {
  const want = tagName.toUpperCase();
  let el: Node | null = node.parentNode;
  while (el) {
    if ((el as Element).tagName === want) return true;
    el = el instanceof ShadowRoot ? el.host : el.parentNode;
  }
  return false;
}
