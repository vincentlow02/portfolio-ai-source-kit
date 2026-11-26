"use client";

import { usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUp, CornerDownRight, Quote, RotateCcw, Sparkles, X } from "lucide-react";
import { Children, Suspense, cloneElement, isValidElement, useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeAnswerHref } from "../../lib/knowledge/link-url";
import { resolveGuardianReply } from "../../lib/portfolio-chat/guardian";
import { isSameOriginPath, requestPortfolioChat, type ChatSource, type ChatTurn } from "./chat-adapter";
import { defaultLabels, defaultQuestions } from "./labels";
import styles from "./portfolio-chat-panel.module.css";
import { usePortfolioSelection, type SelectionContext } from "./use-portfolio-selection";

type Locale = "en" | "zh" | "ja";
type Project = { id: string; name: string };
export type PortfolioChatLabels = {
  heading: string; ask: string; askSelection?: string; askQuote: string; askProject: string; placeholder: string;
  open: string; close: string; reset: string; send: string; removeQuote: string; thinking: string; cancel: string;
  yourQuestion: string; response: string; sources: string; followups: string; projects: string; other: string;
  errors: Record<string, string>; unavailable: string;
};
export type PortfolioChatBrowserConfig = {
  ownerName: string;
  assistantName?: string;
  supportedLanguages?: readonly Locale[];
  labels?: Partial<Record<Locale, Partial<PortfolioChatLabels>>>;
  suggestions?: Partial<Record<Locale, readonly string[]>>;
  endpoint?: string;
  clickEndpoint?: string;
  directoryPath?: string;
  selectionScope?: string;
  publishedPaths?: readonly string[];
};
type HostAppearance = {
  resolveProject?: (path: string) => Project | undefined;
  projectName?: (id: string, title: string, url: string) => string | undefined;
  sourceRank?: (id: string | null, path: string) => number;
  selectionScope?: (path: string) => string | null;
  suggestions?: (locale: Locale, path: string, project?: Project) => readonly string[];
  featuredProjects?: readonly string[];
  triggerDecoration?: ReactNode;
  privateProjectName?: string;
  collapseSourceAnchors?: boolean;
};
export type PortfolioChatPanelProps = {
  children: ReactNode;
  config: PortfolioChatBrowserConfig;
  initialLocale?: Locale;
  className?: string;
  style?: CSSProperties;
  host?: HostAppearance;
};

type Recommendation = { type: "project" | "section"; projectId: string; title: string; url: string; caseStudyUrl: string; thumbnailUrl: string | null; alt: string };
type Message = { role: "user" | "assistant"; content: string; language?: "en" | "zh" | "ja"; quote?: SelectionContext; sources?: ChatSource[]; recommendations?: Recommendation[]; suggestions?: string[]; error?: boolean };
type ProjectTarget = { name: string; url: string; recommendation?: Recommendation };

function compactSources(sources: ChatSource[], host?: HostAppearance) {
  const groups = new Map<string, { name: string; url: string; rank: number }>();
  for (const source of sources) {
    if (!isSameOriginPath(source.url)) continue;
    try {
      const page = new URL(source.url, "https://portfolio.invalid");
      const url = host?.collapseSourceAnchors ? source.url.split("#")[0] : source.url;
      const title = source.projectId ? host?.projectName?.(source.projectId, source.title, source.url) ?? source.title : source.title;
      const key = host?.collapseSourceAnchors && source.projectId ? "project:" + source.projectId : "page:" + url;
      const rank = host?.sourceRank?.(source.projectId, page.pathname) ?? 0;
      if (!groups.has(key) || rank > groups.get(key)!.rank) groups.set(key, { name: title, url, rank });
    } catch { /* Ignore invalid source URLs. */ }
  }
  return [...groups.values()];
}

function projectTargets(message: Message, host?: HostAppearance): Map<string, ProjectTarget> {
  const targets = new Map<string, ProjectTarget>();
  const add = (id: string | null, title: string, url: string, recommendation?: Recommendation) => {
    if (!id || !isSameOriginPath(url) || targets.has(id)) return;
    const name = host?.projectName ? host.projectName(id, title, url) : title;
    if (name) targets.set(id, { name, url, recommendation });
  };
  message.recommendations?.forEach(item => add(item.projectId, item.title, item.url, item));
  message.sources?.forEach(source => add(source.projectId, source.title, source.url));
  return targets;
}

function catalogLines(content: string, sources: ChatSource[], directoryPath?: string) {
  if (!directoryPath) return null;
  const lines = content.split("\n");
  const directorySources = sources.filter(source => {
    try { return new URL(source.url, "https://portfolio.invalid").pathname === directoryPath; } catch { return false; }
  });
  if (!lines.length || lines.length !== directorySources.length || lines.some(line => !/^(?:•\s+|\s+↳\s+).+$/u.test(line))) return null;
  return lines.map((line, index) => ({ line, projectId: directorySources[index].projectId }));
}

function ProjectList({ lines, label, other, targets, onTrack, featuredIds = [] }: { featuredIds?: readonly string[]; lines: NonNullable<ReturnType<typeof catalogLines>>; label: string; other: string; targets: Map<string, ProjectTarget>; onTrack: (item: Recommendation) => void }) {
  const group = featuredIds.length > 0 && featuredIds.every(id => lines.some(item => item.projectId === id)) && lines.some(item => !featuredIds.includes(item.projectId ?? ""));
  const featured = group ? featuredIds.flatMap(id => lines.filter(item => item.projectId === id)) : lines;
  const remaining = group ? lines.filter(item => !featuredIds.includes(item.projectId ?? "")) : [];
  const rows = (items: typeof lines) => items.map((item, index) => {
    const nested = /^\s+↳/u.test(item.line);
    const number = items.slice(0, index + 1).filter(entry => /^•/u.test(entry.line)).length;
    const text = item.line.replace(/^(?:•\s+|\s+↳\s+)/u, "");
    const separator = text.indexOf(" — ");
    const title = separator < 0 ? text : text.slice(0, separator);
    const target = item.projectId ? targets.get(item.projectId) : undefined;
    return <li key={`${item.projectId ?? "entry"}-${index}`} className={nested ? styles.projectListNested : undefined}><span aria-hidden="true">{nested ? "↳" : String(number).padStart(2, "0")}</span><span>{target ? <Link className={styles.projectLink} href={target.url} onClick={() => { if (target.recommendation) onTrack(target.recommendation); }}>{title}</Link> : title}{separator < 0 ? "" : text.slice(separator)}</span></li>;
  });
  return <div><ol className={styles.projectList} aria-label={label}>{rows(featured)}</ol>{remaining.length > 0 && <details className={styles.otherProjects} data-other-projects><summary>{other} <span>{remaining.length}</span></summary><ol className={styles.projectList}>{rows(remaining)}</ol></details>}</div>;
}

function ConversationMessage({ message, onQuestion, showFollowups, locale, copy, config, host }: { copy: PortfolioChatLabels; config: PortfolioChatBrowserConfig; host?: HostAppearance; message: Message; onQuestion: (question: string) => void; showFollowups: boolean; locale: Locale }) {
  const isUser = message.role === "user";
  const projectLines = !isUser ? catalogLines(message.content, message.sources ?? [], config.directoryPath) : null;
  const targets = isUser || message.error ? new Map<string, ProjectTarget>() : projectTargets(message, host);
  const sourcePages = isUser ? [] : compactSources(message.sources ?? [], host);
  function trackRecommendation(item: Recommendation) {
    if (!config.clickEndpoint || !isSameOriginPath(config.clickEndpoint)) return;
    const pathname = document.querySelector('[data-portfolio-access="protected"]') ? "/" : window.location.pathname;
    void fetch(config.clickEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: item.projectId, url: item.url, pageContext: { pathname, lang: locale } }), keepalive: true }).catch(() => {});
  }
  function linkProjectNames(children: ReactNode): ReactNode {
    const names = [...targets.values()].map(target => target.name).sort((a, b) => b.length - a.length);
    if (!names.length) return children;
    const pattern = new RegExp(`(?<![a-z0-9])(${names.map(name => name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|")})(?![a-z0-9])`, "giu");
    return Children.map(children, child => {
      if (typeof child === "string") return child.split(pattern).map((part, index) => {
        const target = [...targets.values()].find(item => item.name.toLowerCase() === part.toLowerCase());
        return target ? <Link key={index} className={styles.projectLink} href={target.url} onClick={() => { if (target.recommendation) trackRecommendation(target.recommendation); }}>{part}</Link> : part;
      });
      if (isValidElement<{ children?: ReactNode }>(child) && (child.type === "strong" || child.type === "em")) return cloneElement(child, {}, linkProjectNames(child.props.children));
      return child;
    });
  }
  return <div className={isUser ? styles.user : styles.assistant} role="group" lang={message.error ? locale : message.language} aria-label={isUser ? copy.yourQuestion : copy.response}>
    {message.quote && <div className={styles.messageQuote}><Quote size={14} aria-hidden="true" /><span>{message.quote.text.length > 180 ? `${message.quote.text.slice(0, 180)}…` : message.quote.text}</span></div>}
    {isUser ? <p>{message.content}</p> : projectLines ? <ProjectList lines={projectLines} label={copy.projects} other={copy.other} targets={targets} onTrack={trackRecommendation} featuredIds={host?.featuredProjects} /> : <div className={styles.answer}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={href => safeAnswerHref(href) ?? ""} components={{
        p: ({ children }) => <p>{linkProjectNames(children)}</p>,
        li: ({ children }) => <li>{linkProjectNames(children)}</li>,
        a: ({ href, children }) => !href ? <>{children}</> : href.startsWith("mailto:")
          ? <a href={href}>{children}</a> : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
        img: () => null,
      }}>
        {message.error && locale !== "en" ? copy.errors[message.content] ?? copy.unavailable : message.content}
      </ReactMarkdown>
    </div>}
    {!isUser && sourcePages.length > 0 && <div className={styles.metadata} lang={locale}>
      <details className={styles.sources} aria-label={copy.sources}><summary>{copy.sources} <span>{String(sourcePages.length).padStart(2, "0")}</span></summary><div>{sourcePages.map(source => <Link key={`${source.name}-${source.url}`} href={source.url}>{source.name} ↗</Link>)}</div></details>
    </div>}
    {!isUser && showFollowups && message.suggestions && message.suggestions.length > 0 && <div className={styles.followups} aria-label={copy.followups}>
      {message.suggestions.slice(0, 2).map(question => <button key={question} type="button" title={question} aria-label={question} onClick={() => onQuestion(question)}><CornerDownRight size={13} aria-hidden="true" /><span>{question}</span></button>)}
    </div>}
  </div>;
}

export function PortfolioChatPanel(props: PortfolioChatPanelProps) {
  return <Suspense fallback={props.children}><PortfolioChatContent {...props} /></Suspense>;
}

function PortfolioChatContent({ children, initialLocale = "en", config, host, className, style }: PortfolioChatPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const languages: readonly Locale[] = config.supportedLanguages?.length ? config.supportedLanguages : ["en", "zh", "ja"];
  const requested = searchParams.get("lang") ?? initialLocale;
  const locale = languages.find(language => language === requested) ?? languages.find(language => language === initialLocale) ?? languages[0];
  const copy = { ...defaultLabels(locale, config.ownerName), ...config.labels?.[locale] };
  const name = config.assistantName ?? config.ownerName + " AI";
  const project = host?.resolveProject?.(pathname);
  const suggestions = host?.suggestions?.(locale, pathname, project) ?? config.suggestions?.[locale] ?? defaultQuestions(locale, config.ownerName);
  const scopeSelector = host?.selectionScope ? host.selectionScope(pathname) : config.selectionScope ?? "main";
  const knowsPath = !config.publishedPaths || config.publishedPaths.includes(pathname);
  const [open, setOpen] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [quote, setQuote] = useState<SelectionContext | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const pending = useRef<AbortController | null>(null);
  const history = useRef<ChatTurn[]>([]);
  const suggested = useRef<string[]>([]);
  const follow = useRef(true);
  const portfolioRef = useRef<HTMLDivElement>(null);
  const selection = usePortfolioSelection(portfolioRef, knowsPath ? scopeSelector : null, pathname);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => { setQuote(null); }, [pathname, locale]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setMobile(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !mobile) return;
    const previousOverflow = document.body.style.overflow;
    const portfolio = portfolioRef.current;
    const panel = panelRef.current;
    const previousInert = portfolio?.inert ?? false;
    document.body.style.overflow = "hidden";
    if (portfolio) portfolio.inert = true;
    closeRef.current?.focus({ preventScroll: true });
    const viewport = window.visualViewport;
    const resize = () => {
      if (viewport && panel) {
        panel.style.height = `${viewport.height}px`;
        panel.style.top = `${viewport.offsetTop}px`;
      }
    };
    resize(); viewport?.addEventListener("resize", resize); viewport?.addEventListener("scroll", resize);
    const onEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      if (portfolio) portfolio.inert = previousInert;
      viewport?.removeEventListener("resize", resize); viewport?.removeEventListener("scroll", resize);
      document.removeEventListener("keydown", onEscape);
      if (panel) { panel.style.height = ""; panel.style.top = ""; }
    };
  }, [open, mobile]);
  useEffect(() => { if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight; }, [messages, busy, open]);
  function askAboutSelection() {
    if (!selection.action) return;
    setQuote(selection.action.context);
    selection.dismiss();
    window.getSelection()?.removeAllRanges();
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  async function submit(value: string) {
    const question = value.trim();
    if (!question || pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    const selected = quote;
    const turns: ChatTurn[] = [...history.current.slice(-10), { role: "user", content: question }];
    follow.current = true;
    setMessages(previous => [...previous, { role: "user", content: question, quote: quote ?? undefined }]);
    setQuote(null);
    setInput(""); setBusy(true);
    if (inputRef.current) { inputRef.current.style.height = "20px"; inputRef.current.style.overflowY = "hidden"; }
    try {
      const guardianReply = resolveGuardianReply(question, locale, { ownerName: config.ownerName, privateProjectName: host?.privateProjectName, supportedLanguages: config.supportedLanguages });
      if (guardianReply) {
        history.current = [...turns, { role: "assistant", content: guardianReply.answer }];
        setMessages(previous => [...previous, { role: "assistant", content: guardianReply.answer, language: guardianReply.language }]);
        return;
      }
      const protectedPage = Boolean(document.querySelector('[data-portfolio-access="protected"]'));
      const response = await requestPortfolioChat(turns, protectedPage || !knowsPath ? undefined : { pathname, lang: locale }, controller.signal, fetch, suggested.current.slice(-36), selected ?? undefined, config.endpoint);
      if (pending.current !== controller) return;
      history.current = [...turns, { role: "assistant", content: response.answer.slice(0, 2000) }];
      suggested.current = [...suggested.current, ...(response.followUpQuestions ?? [])].slice(-36);
      setMessages(previous => [...previous, { role: "assistant", content: response.answer, language: response.language, sources: response.sources, recommendations: response.recommendations, suggestions: response.followUpQuestions }]);
    } catch (error) { if (!controller.signal.aborted) setMessages(previous => [...previous, { role: "assistant", content: error instanceof Error ? error.message : "The assistant is temporarily unavailable.", error: true }]); }
    finally { if (pending.current === controller) { pending.current = null; setBusy(false); inputRef.current?.focus(); } }
  }
  function cancel() {
    pending.current?.abort();
    pending.current = null;
    setBusy(false);
    setMessages(previous => previous.at(-1)?.role === "user" ? previous.slice(0, -1) : previous);
    inputRef.current?.focus();
  }
  function reset() { pending.current?.abort(); pending.current = null; history.current = []; suggested.current = []; setMessages([]); setInput(""); setQuote(null); setBusy(false); follow.current = true; if (inputRef.current) { inputRef.current.style.height = "20px"; inputRef.current.style.overflowY = "hidden"; inputRef.current.focus(); } }
  function onInputChange(event: ChangeEvent<HTMLTextAreaElement>) { const textarea = event.currentTarget; setInput(textarea.value); textarea.style.height = "20px"; const height = Math.min(textarea.scrollHeight, 120); textarea.style.height = `${height}px`; textarea.style.overflowY = textarea.scrollHeight > 120 ? "auto" : "hidden"; }
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); submit(input); } }
  function onSubmit(event: FormEvent) { event.preventDefault(); submit(input); }

  return <div className={[styles.shell, className].filter(Boolean).join(" ")} style={style} data-portfolio-chat-open={open}>
    <div className={styles.portfolio} ref={portfolioRef}>{children}</div>
    {selection.action && (
      <button ref={selection.actionRef} type="button" className={styles.selectionAction}
        onPointerDown={event => event.preventDefault()} onClick={askAboutSelection}>
        <Sparkles size={14} aria-hidden="true" /> {copy.askSelection ?? copy.ask}
      </button>
    )}
    {!open && <button ref={openRef} className={styles.open} type="button" aria-label={copy.open} onClick={() => { setOpen(true); if (!mobile) requestAnimationFrame(() => inputRef.current?.focus()); }}>{host?.triggerDecoration}<Sparkles className={styles.openIcon} size={18} strokeWidth={1.6} /></button>}
    {open && <aside ref={panelRef} className={styles.panel} role={mobile ? "dialog" : undefined} aria-modal={mobile ? true : undefined} aria-label={name}>
      <header className={styles.header}><span>{name}</span><div className={styles.actions}><button type="button" aria-label={copy.reset} onClick={reset}><RotateCcw size={16} /></button><button ref={closeRef} type="button" aria-label={copy.close} onClick={() => { setOpen(false); requestAnimationFrame(() => openRef.current?.focus({ preventScroll: true })); }}><X size={18} /></button></div></header>
      <div className={styles.content} ref={scroll} onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}>
        {messages.length === 0 ? <div className={styles.welcome}><h2>{copy.heading}</h2><div className={styles.suggestions}>{suggestions.map(question => <button key={question} type="button" onClick={() => submit(question)}><ArrowDownLeft size={14} aria-hidden="true" /><span>{question}</span></button>)}</div></div>
          : <div className={styles.messages} aria-live="polite" aria-relevant="additions">{messages.map((message, index) => <ConversationMessage key={`${message.role}-${index}`} message={message} onQuestion={submit} showFollowups={index === messages.length - 1 && !busy} locale={locale} copy={copy} config={config} host={host} />)}{busy && <div className={styles.thinking}><span role="status">{copy.thinking}</span> <button type="button" onClick={cancel}>{copy.cancel}</button></div>}</div>}
      </div>
      <div className={styles.composerArea}>{quote && <div className={styles.quotePreview}><Quote size={15} aria-hidden="true" /><span>{quote.text.length > 180 ? `${quote.text.slice(0, 180)}…` : quote.text}</span><button type="button" aria-label={copy.removeQuote} onClick={() => { setQuote(null); inputRef.current?.focus(); }}><X size={15} /></button></div>}<form className={styles.composer} onSubmit={onSubmit}><textarea ref={inputRef} rows={1} maxLength={2000} aria-label={copy.ask} placeholder={quote ? copy.askQuote : project ? copy.askProject.replace("{project}", () => project.name) : copy.placeholder} value={input} onChange={onInputChange} onKeyDown={onKeyDown} /><button type="submit" disabled={!input.trim() || busy} aria-label={copy.send}><ArrowUp size={17} /></button></form></div>
    </aside>}
  </div>;
}
