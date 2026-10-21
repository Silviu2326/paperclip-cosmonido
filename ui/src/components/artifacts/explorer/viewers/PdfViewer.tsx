import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "@/i18n";
import type { PreviewTarget } from "../preview-target";
import { ViewerMessage } from "./ViewerMessage";

/** Attachments are capped at 10 MB. Anything larger goes to the browser's own viewer. */
const PDFJS_MAX_BYTES = 10 * 1024 * 1024;
/** Width used before the page has been measured (jsdom, hidden panes). */
const DEFAULT_WIDTH = 600;
/** Pages start rendering this far before they scroll into view. */
const RENDER_MARGIN = "600px 0px";
/** Aspect ratio of an A4 page, used for placeholders until the real size is known. */
const PLACEHOLDER_ASPECT = "1 / 1.414";

type PdfJsModule = typeof import("pdfjs-dist");

let pdfJsPromise: Promise<PdfJsModule> | null = null;

/**
 * Loads pdf.js on first use so the engine stays out of the main bundle. The worker is
 * resolved with `new URL(..., import.meta.url)`, which Vite emits as a separate asset.
 */
function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfJsPromise) {
    pdfJsPromise = import("pdfjs-dist")
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        return pdfjs;
      })
      .catch((error: unknown) => {
        pdfJsPromise = null;
        throw error;
      });
  }
  return pdfJsPromise;
}

interface TextChunk {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PageLayout {
  width: number;
  height: number;
  scale: number;
  transform: number[];
}

interface Hit {
  page: number;
  /** Index into the page's text items. */
  item: number;
}

/** Multiplies two PDF transform matrices (same order as pdf.js `Util.transform`). */
function multiplyTransform(a: number[], b: number[]): number[] {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}

/** Rectangle of one text item in percent of the page, so the overlay needs no pixel values. */
function textItemRect(item: TextChunk, layout: PageLayout) {
  const matrix = multiplyTransform(layout.transform, item.transform);
  const fontHeight = Math.hypot(matrix[2]!, matrix[3]!);
  return {
    left: (matrix[4]! / layout.width) * 100,
    top: ((matrix[5]! - fontHeight) / layout.height) * 100,
    width: ((item.width * layout.scale) / layout.width) * 100,
    height: (fontHeight / layout.height) * 100,
  };
}

/**
 * Renders the PDF with pdf.js. The pane shows one page with ◀ n / total ▶ controls. The
 * fullscreen view stacks every page, renders them as they scroll into view, and adds
 * search over the text layer. If pdf.js cannot load the file, the browser's own viewer
 * (the old iframe) is shown with a link to open it in a new tab.
 */
export function PdfViewer({ target, mode = "pane" }: { target: PreviewTarget; mode?: "pane" | "fullscreen" }) {
  const { t } = useTranslation();
  const src = target.contentPath;
  const openHref = target.openPath ?? src;
  const nativeOnly = target.byteSize != null && target.byteSize > PDFJS_MAX_BYTES;
  const [loaded, setLoaded] = useState<{ src: string; doc: PDFDocumentProxy | null; failed: boolean }>({
    src: "",
    doc: null,
    failed: false,
  });

  useEffect(() => {
    if (!src || nativeOnly) return;
    let cancelled = false;
    let loadingTask: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } | null = null;
    loadPdfJs()
      .then((pdfjs) => {
        if (cancelled) return null;
        loadingTask = pdfjs.getDocument({ url: src });
        return loadingTask.promise;
      })
      .then((doc) => {
        if (doc && !cancelled) setLoaded({ src, doc, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ src, doc: null, failed: true });
      });
    return () => {
      cancelled = true;
      // Destroying the loading task also releases the document it produced.
      void loadingTask?.destroy();
    };
  }, [src, nativeOnly]);

  if (!src) return <ViewerMessage>{t("artifacts.explorer.viewer.unavailable")}</ViewerMessage>;
  if (nativeOnly) return <NativePdf src={src} title={target.title} openHref={openHref} />;

  const current = loaded.src === src ? loaded : null;
  if (current?.failed) {
    return (
      <NativePdf src={src} title={target.title} openHref={openHref} banner={t("artifacts.explorer.viewer.loadError")} />
    );
  }
  if (!current?.doc) return <ViewerMessage>{t("artifacts.explorer.viewer.loading")}</ViewerMessage>;
  return <PdfDocumentView doc={current.doc} mode={mode} />;
}

/** Browser's own PDF viewer. Used for files over the pdf.js limit and when pdf.js fails. */
function NativePdf({ src, title, openHref, banner }: { src: string; title: string; openHref: string | null; banner?: string }) {
  const { t } = useTranslation();
  const pdfViewerDisabled =
    typeof navigator !== "undefined" && (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled === false;
  if (pdfViewerDisabled) {
    return (
      <ViewerMessage>
        <span>{t("artifacts.explorer.viewer.pdfBlocked")}</span>
        {openHref ? (
          <a href={openHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("artifacts.explorer.preview.openNewTab")}
          </a>
        ) : null}
      </ViewerMessage>
    );
  }
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {banner ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
          <span>{banner}</span>
          {openHref ? (
            <a href={openHref} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("artifacts.explorer.preview.openNewTab")}
            </a>
          ) : null}
        </div>
      ) : null}
      {/* Not sandboxed: the built-in PDF plugin needs the sandbox to be absent. */}
      <iframe src={src} title={title} className="block min-h-0 w-full flex-1 border-0 bg-background" />
    </div>
  );
}

function PdfDocumentView({ doc, mode }: { doc: PDFDocumentProxy; mode: "pane" | "fullscreen" }) {
  const { t } = useTranslation();
  const numPages = doc.numPages;
  const [pageNumber, setPageNumber] = useState(1);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [hitCursor, setHitCursor] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const searchRun = useRef(0);
  const pageElements = useRef(new Map<number, HTMLDivElement>());

  // Text per page is cached per document; search and highlights both read from it.
  const textCache = useMemo(() => new Map<number, Promise<TextChunk[]>>(), [doc]);
  const getText = useCallback(
    (page: number) => {
      let cached = textCache.get(page);
      if (!cached) {
        cached = doc
          .getPage(page)
          .then((pdfPage) => pdfPage.getTextContent())
          .then((content) =>
            content.items.flatMap((item) =>
              "str" in item ? [{ str: item.str, transform: item.transform, width: item.width, height: item.height }] : [],
            ),
          );
        textCache.set(page, cached);
      }
      return cached;
    },
    [doc, textCache],
  );

  const registerPage = useCallback((page: number, element: HTMLDivElement | null) => {
    if (element) pageElements.current.set(page, element);
    else pageElements.current.delete(page);
  }, []);

  const goToPage = useCallback(
    (page: number) => {
      const next = Math.min(Math.max(page, 1), numPages);
      setPageNumber(next);
      if (mode === "fullscreen") pageElements.current.get(next)?.scrollIntoView?.({ block: "start" });
    },
    [mode, numPages],
  );

  // Fullscreen: the top-most visible page is the current one.
  useEffect(() => {
    if (mode !== "fullscreen" || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.pdfPage);
          if (entry.isIntersecting) visible.add(page);
          else visible.delete(page);
        }
        if (visible.size > 0) setPageNumber(Math.min(...visible));
      },
      { threshold: 0 },
    );
    pageElements.current.forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [doc, mode]);

  const runSearch = async (event: FormEvent) => {
    event.preventDefault();
    const needle = query.trim().toLowerCase();
    const run = ++searchRun.current;
    if (!needle) {
      setHits([]);
      setHitCursor(-1);
      setSearched(false);
      return;
    }
    setSearching(true);
    const found: Hit[] = [];
    for (let page = 1; page <= numPages; page += 1) {
      const items = await getText(page);
      if (run !== searchRun.current) return;
      items.forEach((item, index) => {
        if (item.str.toLowerCase().includes(needle)) found.push({ page, item: index });
      });
    }
    if (run !== searchRun.current) return;
    setSearching(false);
    setSearched(true);
    setHits(found);
    setHitCursor(found.length > 0 ? 0 : -1);
    if (found.length > 0) goToPage(found[0]!.page);
  };

  const stepHit = (delta: number) => {
    if (hits.length === 0) return;
    const next = (hitCursor + delta + hits.length) % hits.length;
    setHitCursor(next);
    goToPage(hits[next]!.page);
  };

  const activeHit = hitCursor >= 0 ? (hits[hitCursor] ?? null) : null;
  const pageControls = (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("artifacts.explorer.pdf.prev")}
        title={t("artifacts.explorer.pdf.prev")}
        disabled={pageNumber <= 1}
        onClick={() => goToPage(pageNumber - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>
      <span className="min-w-12 text-center text-xs text-muted-foreground tabular-nums">
        {t("artifacts.explorer.pdf.pageOf", { page: pageNumber, total: numPages })}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={t("artifacts.explorer.pdf.next")}
        title={t("artifacts.explorer.pdf.next")}
        disabled={pageNumber >= numPages}
        onClick={() => goToPage(pageNumber + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </div>
  );

  if (mode === "pane") {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <div className="flex shrink-0 items-center justify-center border-b border-border px-1.5 py-1">{pageControls}</div>
        <div className="min-h-0 flex-1 overflow-auto">
          <PdfPage
            doc={doc}
            pageNumber={pageNumber}
            getText={getText}
            eager
            hitItems={[]}
            activeItem={null}
            register={registerPage}
          />
        </div>
      </div>
    );
  }

  const hitMessage = searching
    ? t("artifacts.explorer.pdf.searching")
    : hits.length > 0
      ? t("artifacts.explorer.pdf.matchOf", { index: hitCursor + 1, total: hits.length })
      : searched
        ? t("artifacts.explorer.pdf.noMatches")
        : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        {pageControls}
        <form role="search" onSubmit={runSearch} className="flex min-w-0 flex-1 items-center gap-2">
          <div className="relative min-w-0 max-w-xs flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label={t("artifacts.explorer.pdf.search")}
              placeholder={t("artifacts.explorer.pdf.searchPlaceholder")}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-8 pl-8"
            />
          </div>
          {hitMessage ? <span className="text-xs whitespace-nowrap text-muted-foreground">{hitMessage}</span> : null}
          {hits.length > 0 ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("artifacts.explorer.pdf.prevMatch")}
                title={t("artifacts.explorer.pdf.prevMatch")}
                onClick={() => stepHit(-1)}
              >
                <ChevronLeft aria-hidden />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={t("artifacts.explorer.pdf.nextMatch")}
                title={t("artifacts.explorer.pdf.nextMatch")}
                onClick={() => stepHit(1)}
              >
                <ChevronRight aria-hidden />
              </Button>
            </div>
          ) : null}
        </form>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-auto bg-muted p-3">
        {Array.from({ length: numPages }, (_, index) => index + 1).map((page) => (
          <PdfPage
            key={page}
            doc={doc}
            pageNumber={page}
            getText={getText}
            eager={page === 1}
            hitItems={hits.filter((hit) => hit.page === page).map((hit) => hit.item)}
            activeItem={activeHit?.page === page ? activeHit.item : null}
            register={registerPage}
          />
        ))}
      </div>
    </div>
  );
}

interface PdfPageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  getText: (page: number) => Promise<TextChunk[]>;
  /** Render now instead of waiting for the page to scroll near the viewport. */
  eager: boolean;
  hitItems: number[];
  activeItem: number | null;
  register: (page: number, element: HTMLDivElement | null) => void;
}

/** One page: a canvas, plus translucent highlight rectangles over matched text items. */
function PdfPage({ doc, pageNumber, getText, eager, hitItems, activeItem, register }: PdfPageProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visible, setVisible] = useState(eager);
  const [width, setWidth] = useState(0);
  const [layout, setLayout] = useState<PageLayout | null>(null);
  const [texts, setTexts] = useState<TextChunk[] | null>(null);
  const hasHits = hitItems.length > 0;

  const setWrap = useCallback(
    (element: HTMLDivElement | null) => {
      wrapRef.current = element;
      register(pageNumber, element);
    },
    [pageNumber, register],
  );

  // Track the available width so the page fits the pane or the dialog.
  useEffect(() => {
    const element = wrapRef.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth || DEFAULT_WIDTH);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Lazy rendering: a page is drawn once it is near the viewport, and stays drawn.
  useEffect(() => {
    if (eager || visible) return;
    const element = wrapRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: RENDER_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [eager, visible]);

  useEffect(() => {
    if (!visible || width <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    const draw = async () => {
      try {
        const page: PDFPageProxy = await doc.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = width / base.width;
        const cssViewport = page.getViewport({ scale });
        const dpr = typeof window !== "undefined" && window.devicePixelRatio ? window.devicePixelRatio : 1;
        const drawViewport = page.getViewport({ scale: scale * dpr });
        if (cancelled) return;
        canvas.width = Math.floor(drawViewport.width);
        canvas.height = Math.floor(drawViewport.height);
        setLayout({ width: cssViewport.width, height: cssViewport.height, scale, transform: cssViewport.transform });
        task = page.render({ canvas, viewport: drawViewport });
        await task.promise;
      } catch {
        // Cancelled (scrolled away or resized) or failed: the page keeps its placeholder.
      }
    };
    void draw();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageNumber, visible, width]);

  useEffect(() => {
    if (!hasHits || texts) return;
    let cancelled = false;
    getText(pageNumber)
      .then((chunks) => {
        if (!cancelled) setTexts(chunks);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getText, hasHits, pageNumber, texts]);

  const rects =
    layout && texts && hasHits
      ? hitItems.flatMap((index) => {
          const chunk = texts[index];
          return chunk ? [{ index, rect: textItemRect(chunk, layout) }] : [];
        })
      : [];

  return (
    <div
      ref={setWrap}
      data-pdf-page={pageNumber}
      className="relative w-full max-w-3xl shrink-0 overflow-hidden rounded-sm bg-background shadow-sm"
      style={{ aspectRatio: layout ? `${layout.width} / ${layout.height}` : PLACEHOLDER_ASPECT }}
    >
      <canvas ref={canvasRef} className="block size-full" />
      {rects.map(({ index, rect }) => (
        <span
          key={index}
          data-pdf-highlight={index === activeItem ? "active" : "match"}
          aria-hidden
          className="pointer-events-none absolute"
          style={{
            left: `${rect.left}%`,
            top: `${rect.top}%`,
            width: `${rect.width}%`,
            height: `${rect.height}%`,
            background:
              index === activeItem
                ? "color-mix(in srgb, var(--paperclip-doc-annotation-highlight-source) 70%, transparent)"
                : "color-mix(in srgb, var(--paperclip-doc-annotation-highlight-source) 32%, transparent)",
          }}
        />
      ))}
    </div>
  );
}
