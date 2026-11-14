import { useEffect, useId, useRef, useCallback } from "react";

export type BackStepKind = "layer" | "tab" | "selection";

export interface BackLedgerStep {
  id: string;
  kind: BackStepKind;
  sourceId: string;
  pathname: string;
  undo: () => void;
}

export interface BackHistoryEnv {
  getPathname: () => string;
  getSearch: () => string;
  getHref: () => string;
  getState: () => any;
  pushState: (state: any, url: string) => void;
  replaceState: (state: any, url: string) => void;
  go: (delta: number) => void;
  back: () => void;
  forward: () => void;
  schedule: (cb: () => void) => any;
  cancelSchedule: (handle: any) => void;
}

export function createBackNavigationController(env: BackHistoryEnv) {
  let stepSeq = 0;
  let pageSeq = 0;
  let currentPathname = env.getPathname();
  let currentSearch = env.getSearch();
  let currentPageId = `gfm_page_${++pageSeq}`;
  let lastObservedState: any = env.getState();
  let cleanHrefForPage: string | null = null;

  let ledger: BackLedgerStep[] = [];
  let isRestoringFromBack = false;
  let pendingRewindTargetDepth: number | null = null;
  let staleSkipDirection: "back" | "forward" | null = null;
  let scheduledHandle: any = null;

  function isKioskLocked(): boolean {
    const st = env.getState();
    return Boolean(st && typeof st === "object" && st.kioskLocked);
  }

  function getActualBrowserDepth(): number {
    const st = env.getState();
    if (
      st &&
      typeof st === "object" &&
      st.__gfmPageId === currentPageId &&
      typeof st.__gfmDepth === "number"
    ) {
      return st.__gfmDepth;
    }
    return 0;
  }

  function buildHistoryState(depth: number, stepId: string) {
    const raw = env.getState();
    const base = raw && typeof raw === "object" ? { ...raw } : {};
    return {
      ...base,
      __gfmPageId: currentPageId,
      __gfmDepth: depth,
      __gfmStepId: stepId,
      __gfmPathname: currentPathname,
    };
  }

  function resetForNewRoute() {
    currentPathname = env.getPathname();
    currentSearch = env.getSearch();
    currentPageId = `gfm_page_${++pageSeq}`;
    ledger = [];
    pendingRewindTargetDepth = null;
    staleSkipDirection = null;
    cleanHrefForPage = null;
    lastObservedState = env.getState();
    if (scheduledHandle !== null) {
      env.cancelSchedule(scheduledHandle);
      scheduledHandle = null;
    }
  }

  function ensureRouteSynced(): boolean {
    const nowPath = env.getPathname();
    if (nowPath !== currentPathname) {
      resetForNewRoute();
      return true;
    }
    currentSearch = env.getSearch();
    return false;
  }

  function flushSync() {
    scheduledHandle = null;
    if (isKioskLocked()) return;

    if (env.getPathname() !== currentPathname) {
      resetForNewRoute();
      return;
    }

    if (pendingRewindTargetDepth !== null) {
      // Wait for the in-flight history.go(delta) popstate to arrive; handlePopState will re-sync if needed.
      return;
    }

    let actualDepth = getActualBrowserDepth();
    const desiredDepth = ledger.length;

    if (desiredDepth < actualDepth) {
      const delta = desiredDepth - actualDepth;
      pendingRewindTargetDepth = desiredDepth;
      env.go(delta);
      return;
    }

    if (desiredDepth > actualDepth) {
      while (actualDepth < desiredDepth) {
        const step = ledger[actualDepth];
        actualDepth += 1;
        const nextState = buildHistoryState(actualDepth, step.id);
        env.pushState(nextState, env.getHref());
        lastObservedState = nextState;
      }
    } else if (desiredDepth > 0 && desiredDepth === actualDepth) {
      const topStep = ledger[desiredDepth - 1];
      const curState = env.getState();
      if (!curState || curState.__gfmStepId !== topStep.id) {
        const nextState = buildHistoryState(desiredDepth, topStep.id);
        env.replaceState(nextState, env.getHref());
        lastObservedState = nextState;
      }
    }
  }

  function scheduleSync() {
    if (scheduledHandle !== null) return;
    scheduledHandle = env.schedule(flushSync);
  }

  function pushStep(kind: BackStepKind, sourceId: string, undo: () => void, maxForSource?: number): string | null {
    if (isKioskLocked() || isRestoringFromBack) return null;
    ensureRouteSynced();

    if (maxForSource && maxForSource > 0) {
      const existingForSource = ledger.filter((s) => s.sourceId === sourceId);
      if (existingForSource.length >= maxForSource) {
        const oldest = existingForSource[0];
        ledger = ledger.filter((s) => s.id !== oldest.id);
      }
    }

    const step: BackLedgerStep = {
      id: `gfm_step_${++stepSeq}`,
      kind,
      sourceId,
      pathname: currentPathname,
      undo,
    };
    ledger.push(step);

    // If there is no pending rewind and browser depth is exactly desiredDepth - 1, push synchronously
    // so immediate hardware/browser Back presses always see the history entry without waiting a tick.
    if (pendingRewindTargetDepth === null && scheduledHandle === null) {
      const actualDepth = getActualBrowserDepth();
      if (actualDepth === ledger.length - 1) {
        const nextState = buildHistoryState(ledger.length, step.id);
        env.pushState(nextState, env.getHref());
        lastObservedState = nextState;
        return step.id;
      }
      if (actualDepth === ledger.length) {
        const nextState = buildHistoryState(ledger.length, step.id);
        env.replaceState(nextState, env.getHref());
        lastObservedState = nextState;
        return step.id;
      }
    }

    scheduleSync();
    return step.id;
  }

  function removeStepById(stepId: string | null | undefined) {
    if (env.getPathname() !== currentPathname) {
      resetForNewRoute();
      return;
    }
    if (!stepId) return;
    const before = ledger.length;
    ledger = ledger.filter((s) => s.id !== stepId);
    if (ledger.length !== before) {
      scheduleSync();
    }
  }

  function removeStepsBySource(sourceId: string) {
    if (env.getPathname() !== currentPathname) {
      resetForNewRoute();
      return;
    }
    if (!sourceId) return;
    const before = ledger.length;
    ledger = ledger.filter((s) => s.sourceId !== sourceId);
    if (ledger.length !== before) {
      scheduleSync();
    }
  }

  function handleExternalHistoryWrite(kind?: "push" | "replace") {
    staleSkipDirection = null;
    if (env.getPathname() !== currentPathname) {
      resetForNewRoute();
      return;
    }
    if (kind === "replace" && (ledger.length > 0 || getActualBrowserDepth() > 0)) {
      cleanHrefForPage = env.getHref();
    }
    currentSearch = env.getSearch();
    lastObservedState = env.getState();
  }

  function prepareOverlayNavigation(targetHref: string): { shouldReplace: boolean } {
    if (isKioskLocked()) return { shouldReplace: false };
    const actualDepth = getActualBrowserDepth();
    const hasOverlayHistory = actualDepth > 0 || ledger.length > 0;
    const currentFullHref = env.getPathname() + env.getSearch();
    const targetPath = String(targetHref || "").split("?")[0] || "/";

    // Clear active ledger without scheduling a rewind so the upcoming route navigation isn't undone
    ledger = [];
    pendingRewindTargetDepth = null;
    staleSkipDirection = null;
    if (scheduledHandle !== null) {
      env.cancelSchedule(scheduledHandle);
      scheduledHandle = null;
    }

    // When navigating to a new query on the same pathname from an overlay, advance currentPageId
    // so any earlier synthetic steps beneath the replaced entry are treated as stale if reached via Back.
    if (hasOverlayHistory && targetPath === env.getPathname() && targetHref !== currentFullHref) {
      currentPageId = `gfm_page_${++pageSeq}`;
      cleanHrefForPage = null;
    }

    // If we pushed at least 1 in-page step, replacing the current top entry keeps the base page right underneath targetHref
    return { shouldReplace: hasOverlayHistory && targetHref !== currentFullHref };
  }

  function handlePopState(eventState?: any) {
    if (isKioskLocked()) return;

    const nowPath = env.getPathname();
    const nowSearch = env.getSearch();
    const curState = eventState !== undefined ? eventState : env.getState();
    const prevState = lastObservedState;
    const prevPath = currentPathname;
    const prevSearch = currentSearch;

    lastObservedState = curState;

    // Route changed to a different pathname: clear in-page ledger and let router render the destination page
    if (nowPath !== prevPath) {
      resetForNewRoute();
      return;
    }

    currentSearch = nowSearch;
    const actualDepth = getActualBrowserDepth();

    // Handle completion of our own programmatic history.go(delta) rewind
    if (pendingRewindTargetDepth !== null) {
      staleSkipDirection = null;
      const expectedDepth = pendingRewindTargetDepth;
      pendingRewindTargetDepth = null;

      if (cleanHrefForPage && env.getHref() !== cleanHrefForPage) {
        env.replaceState(curState, cleanHrefForPage);
        currentSearch = env.getSearch();
      }

      // If the user ALSO pressed Back beyond our programmatic rewind target, undo remaining steps down to actualDepth
      if (actualDepth < expectedDepth && ledger.length > actualDepth) {
        isRestoringFromBack = true;
        try {
          while (ledger.length > actualDepth) {
            const popped = ledger.pop()!;
            popped.undo();
          }
        } finally {
          isRestoringFromBack = false;
        }
      }

      // If new steps were queued while rewind was in flight (or top step ID changed during swap), synchronize now
      const topStep = ledger.length > 0 ? ledger[ledger.length - 1] : null;
      if (
        ledger.length !== getActualBrowserDepth() ||
        (topStep && (!curState || curState.__gfmStepId !== topStep.id))
      ) {
        scheduleSync();
      }
      return;
    }

    // Normal user Back press on the current page: pop and undo in LIFO order down to actualDepth
    if (ledger.length > actualDepth) {
      staleSkipDirection = null;
      if (cleanHrefForPage && env.getHref() !== cleanHrefForPage) {
        env.replaceState(curState, cleanHrefForPage);
        currentSearch = env.getSearch();
      }
      isRestoringFromBack = true;
      try {
        while (ledger.length > actualDepth) {
          const popped = ledger.pop()!;
          popped.undo();
        }
      } finally {
        isRestoringFromBack = false;
      }
      return;
    }

    // Stale orphan entry from an earlier visit to this same URL (e.g. tabs visited before navigating away via a link):
    // Skip past ghost entries cleanly in BOTH Back and Forward directions so the user never gets stuck on the same URL.
    if (ledger.length === 0 && nowPath === prevPath) {
      const prevHasStalePage =
        Boolean(prevState && typeof prevState === "object" && typeof prevState.__gfmPageId === "string" && prevState.__gfmPageId !== currentPageId);
      const curHasStalePage =
        Boolean(curState && typeof curState === "object" && typeof curState.__gfmPageId === "string" && curState.__gfmPageId !== currentPageId);

      if (staleSkipDirection === "forward") {
        if (curHasStalePage) {
          env.forward();
        } else {
          staleSkipDirection = null;
        }
        return;
      }

      if (staleSkipDirection === "back") {
        if (curHasStalePage) {
          env.back();
        } else {
          // Reached the depth-0 base entry of the stale visit; step back once more to exit onto the prior page/entry
          staleSkipDirection = null;
          env.back();
        }
        return;
      }

      if (prevHasStalePage) {
        const stalePageId = prevState.__gfmPageId;
        const prevDepth = typeof prevState.__gfmDepth === "number" ? prevState.__gfmDepth : 1;
        const currIsSameStale =
          Boolean(curState && typeof curState === "object" && curState.__gfmPageId === stalePageId);
        const currDepth = currIsSameStale && typeof curState.__gfmDepth === "number" ? curState.__gfmDepth : 0;

        if (!currIsSameStale || currDepth < prevDepth) {
          if (curHasStalePage) {
            staleSkipDirection = "back";
          }
          env.back();
        } else if (currDepth > prevDepth) {
          staleSkipDirection = "forward";
          env.forward();
        }
      } else if (curHasStalePage && nowSearch === prevSearch) {
        // Stepped Forward from a base (non-step) page entry onto a stale ghost entry
        staleSkipDirection = "forward";
        env.forward();
      }
    } else {
      staleSkipDirection = null;
    }
  }

  return {
    pushStep,
    removeStepById,
    removeStepsBySource,
    prepareOverlayNavigation,
    handleExternalHistoryWrite,
    handlePopState,
    getLedger: () => [...ledger],
    getIsRestoringFromBack: () => isRestoringFromBack,
    getActualBrowserDepth,
  };
}

type ControllerInstance = ReturnType<typeof createBackNavigationController>;

let singletonController: ControllerInstance | null = null;

function getBrowserController(): ControllerInstance | null {
  if (typeof window === "undefined") return null;
  if (!singletonController) {
    const rawPushState = window.history.pushState.bind(window.history);
    const rawReplaceState = window.history.replaceState.bind(window.history);
    let internalHistoryMutation = false;

    window.history.pushState = function (data: any, unused: string, url?: string | URL | null) {
      const result = rawPushState(data, unused, url);
      if (!internalHistoryMutation) {
        singletonController?.handleExternalHistoryWrite("push");
      }
      return result;
    };

    // Preserve active in-page back-ledger metadata when external callers (e.g., query-param cleanup
    // `window.history.replaceState({}, "", cleanUrl)`) update the URL on the same pathname.
    window.history.replaceState = function (data: any, unused: string, url?: string | URL | null) {
      if (
        !internalHistoryMutation &&
        singletonController &&
        singletonController.getLedger().length > 0
      ) {
        const cur = window.history.state;
        if (cur && typeof cur === "object" && typeof cur.__gfmPageId === "string") {
          let targetPath = window.location.pathname;
          if (url != null) {
            try {
              targetPath = new URL(String(url), window.location.href).pathname;
            } catch {}
          }
          if (targetPath === cur.__gfmPathname) {
            const base = data && typeof data === "object" ? { ...data } : {};
            if (base.__gfmPageId === undefined) {
              data = {
                ...base,
                __gfmPageId: cur.__gfmPageId,
                __gfmDepth: cur.__gfmDepth,
                __gfmStepId: cur.__gfmStepId,
                __gfmPathname: cur.__gfmPathname,
              };
            }
          }
        }
      }
      const result = rawReplaceState(data, unused, url);
      if (!internalHistoryMutation) {
        singletonController?.handleExternalHistoryWrite("replace");
      }
      return result;
    };

    singletonController = createBackNavigationController({
      getPathname: () => window.location.pathname,
      getSearch: () => window.location.search,
      getHref: () => window.location.href,
      getState: () => window.history.state,
      pushState: (state, url) => {
        internalHistoryMutation = true;
        try {
          rawPushState(state, "", url);
        } finally {
          internalHistoryMutation = false;
        }
      },
      replaceState: (state, url) => {
        internalHistoryMutation = true;
        try {
          rawReplaceState(state, "", url);
        } finally {
          internalHistoryMutation = false;
        }
      },
      go: (delta) => window.history.go(delta),
      back: () => window.history.back(),
      forward: () => window.history.forward(),
      schedule: (cb) => window.setTimeout(cb, 0),
      cancelSchedule: (id) => window.clearTimeout(id),
    });

    window.addEventListener("popstate", (e) => {
      singletonController?.handlePopState(e.state);
    });
  }
  return singletonController;
}

/**
 * Registers an open modal, drawer, sheet, dropdown, fullscreen view, or mobile detail pane
 * in the browser Back stack so pressing Back closes the layer instead of leaving the page.
 */
export function useBackLayer(
  isOpen: boolean,
  onClose: () => void,
  options?: string | { id?: string; disabled?: boolean },
): void {
  const reactId = useId();
  const parsed = typeof options === "string" ? { id: options } : options || {};
  const sourceId = parsed.id || `layer_${reactId}`;
  const disabled = Boolean(parsed.disabled);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen || disabled) return;
    const ctrl = getBrowserController();
    if (!ctrl) return;

    const stepId = ctrl.pushStep("layer", sourceId, () => {
      onCloseRef.current();
    });

    return () => {
      if (stepId) {
        ctrl.removeStepById(stepId);
      }
    };
  }, [isOpen, disabled, sourceId]);
}

type NoInferTab<T> = [T][T extends any ? 0 : never];

/**
 * Tracks visited in-page tabs so pressing Back returns through previously visited tabs
 * before exiting the current page. Automatically cleans up if the tab container unmounts
 * (e.g. tabs inside a modal that closes).
 */
export function useBackTabState<T extends string>(
  value: T | undefined,
  onChange: (prev: NoInferTab<T>) => void,
  options?: { id?: string; disabled?: boolean; maxHistory?: number },
): void {
  const reactId = useId();
  const sourceId = options?.id || `tabs_${reactId}`;
  const disabled = Boolean(options?.disabled);
  const maxHistory = options?.maxHistory ?? 15;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const prevValueRef = useRef<T | undefined>(value);
  const restoringTargetRef = useRef<T | null>(null);
  const mountedPathRef = useRef<string>(
    typeof window !== "undefined" ? window.location.pathname : "",
  );

  useEffect(() => {
    if (disabled) {
      prevValueRef.current = value;
      return;
    }
    const ctrl = getBrowserController();
    if (!ctrl || value === undefined) {
      prevValueRef.current = value;
      return;
    }

    const nowPath = window.location.pathname;
    if (nowPath !== mountedPathRef.current) {
      mountedPathRef.current = nowPath;
      prevValueRef.current = value;
      restoringTargetRef.current = null;
      return;
    }

    if (restoringTargetRef.current !== null && restoringTargetRef.current === value) {
      restoringTargetRef.current = null;
      prevValueRef.current = value;
      return;
    }

    const previous = prevValueRef.current;
    if (previous !== undefined && previous !== value) {
      const targetToRestore = previous;
      ctrl.pushStep(
        "tab",
        sourceId,
        () => {
          restoringTargetRef.current = targetToRestore;
          onChangeRef.current(targetToRestore);
        },
        maxHistory,
      );
    }

    prevValueRef.current = value;
  }, [value, disabled, sourceId, maxHistory]);

  // Clean up any tab steps belonging to this Tabs instance when it unmounts (e.g., inside a closing Dialog)
  useEffect(() => {
    return () => {
      const ctrl = getBrowserController();
      ctrl?.removeStepsBySource(sourceId);
    };
  }, [sourceId]);
}

/**
 * Imperatively records a reversible selection step (such as switching between open WhatsApp
 * conversations or open emails) on the current page.
 */
export function recordBackSelectionStep(
  sourceId: string,
  undo: () => void,
  maxHistory = 12,
): string | null {
  const ctrl = getBrowserController();
  if (!ctrl) return null;
  return ctrl.pushStep("selection", sourceId, undo, maxHistory);
}

export function clearBackStepsBySource(sourceId: string): void {
  const ctrl = getBrowserController();
  ctrl?.removeStepsBySource(sourceId);
}

export function isRestoringFromBackNavigation(): boolean {
  const ctrl = getBrowserController();
  return Boolean(ctrl?.getIsRestoringFromBack());
}

/**
 * Helper to navigate to a route from inside an overlay/drawer (like the mobile menu or quick grid)
 * without leaving an extra orphan history entry behind.
 */
export function navigateFromOverlay(
  setLocation: (to: string, options?: { replace?: boolean }) => void,
  href: string,
  closeOverlay?: () => void,
): void {
  const ctrl = getBrowserController();
  if (!ctrl || typeof window === "undefined") {
    closeOverlay?.();
    setLocation(href);
    return;
  }

  const currentFull = window.location.pathname + window.location.search;
  if (href === window.location.pathname || href === currentFull) {
    closeOverlay?.();
    return;
  }

  const { shouldReplace } = ctrl.prepareOverlayNavigation(href);
  closeOverlay?.();
  setLocation(href, { replace: shouldReplace });
}
