/**
 * Container-scoped scroll utilities.
 * Replaces native `scrollIntoView` which on mobile browsers can scroll
 * ALL ancestor containers (including the page body), pushing fixed UI
 * elements off-screen.
 */

interface ScrollIntoContainerOptions {
  /** Where to position the element within the container viewport */
  block?: 'center' | 'start' | 'end' | 'nearest';
  /** Use smooth scroll animation */
  smooth?: boolean;
}

/**
 * Scroll a container so that `element` is visible at the given `block` position.
 * Unlike `element.scrollIntoView()`, this ONLY scrolls the specified container
 * and never propagates to ancestor scroll containers or the page viewport.
 */
export function scrollElementIntoContainer(
  container: HTMLElement,
  element: HTMLElement,
  options: ScrollIntoContainerOptions = {},
): void {
  const { block = 'center', smooth = false } = options;

  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();

  // Element position relative to the container's visible area
  const elementTopInContainer = elementRect.top - containerRect.top;
  const elementBottomInContainer = elementRect.bottom - containerRect.top;

  let targetScrollTop: number;

  switch (block) {
    case 'start':
      targetScrollTop = container.scrollTop + elementTopInContainer;
      break;
    case 'end':
      targetScrollTop =
        container.scrollTop + elementBottomInContainer - container.clientHeight;
      break;
    case 'center':
      targetScrollTop =
        container.scrollTop +
        elementTopInContainer -
        container.clientHeight / 2 +
        element.offsetHeight / 2;
      break;
    case 'nearest': {
      // Already fully visible — no-op
      if (elementTopInContainer >= 0 && elementBottomInContainer <= container.clientHeight) {
        return;
      }
      if (elementTopInContainer < 0) {
        // Element is above the visible area
        targetScrollTop = container.scrollTop + elementTopInContainer;
      } else {
        // Element is below the visible area
        targetScrollTop =
          container.scrollTop + elementBottomInContainer - container.clientHeight;
      }
      break;
    }
  }

  // Clamp to valid scroll range
  targetScrollTop = Math.max(
    0,
    Math.min(targetScrollTop, container.scrollHeight - container.clientHeight),
  );

  if (smooth) {
    container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
  } else {
    container.scrollTop = targetScrollTop;
  }
}
