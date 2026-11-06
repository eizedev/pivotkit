/*
 * useLayoutEffect in the browser, useEffect on a server render (where layout effects do not run and
 * React warns about them).
 */

import { useEffect, useLayoutEffect } from "react";

export const useIsoLayoutEffect = typeof window !== "undefined" && typeof document !== "undefined" ? useLayoutEffect : useEffect;
