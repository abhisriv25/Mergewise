import { useEffect } from "react";

/** The landing page's title, also the static <title> in index.html for
 * crawlers that don't run JavaScript. */
export const HOME_TITLE = "Mergewise: review what matters, skim the rest";

/** Sets the browser tab title, as "Page · Mergewise". Pass null for the
 * home page's own title. */
export function usePageTitle(page: string | null) {
  useEffect(() => {
    document.title = page ? `${page} · Mergewise` : HOME_TITLE;
  }, [page]);
}
