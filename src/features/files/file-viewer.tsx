"use client";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useBackendConnection } from "@/providers/backend-connection-provider";
import { useArchiveRequest } from "@/features/settings/use-archive-request";
import { FileDownloadButton } from "@/components/content/file-download-button";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/brand/wordmark";
import { useI18n } from "@/i18n/use-i18n";
import { formatFileSize } from "@/lib/file-size";
import { csvPreview, formatJsonText, parseFilePreview, type FilePreview } from "@/lib/file-preview";
import { sandboxedHtmlDocument } from "@/lib/file-hosting";
import { AuthenticatedImage } from "@/components/content/authenticated-image";

function PreviewContent({ file, source, path }: { file: FilePreview; source: boolean; path: string }) {
  const { t } = useI18n();
  if (file.kind === "image") return <div className="file-image-container"><AuthenticatedImage href={`${path}/download`} mediaType={file.mediaType!} alt={file.filename} /></div>;
  if (source || file.kind === "text") return <pre className="file-raw">{file.content}</pre>;
  if (file.kind === "html") return <iframe className="file-html-frame" title={file.filename}
    sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={sandboxedHtmlDocument(file.content)} />;
  if (file.kind === "markdown") return file.content.length > 100_000
    ? <><p className="file-notice">{t("files.renderLimit")}</p><pre className="file-raw">{file.content}</pre></>
    : <div className="markdown-body file-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
      a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
      img: ({ alt }) => <span>{alt || t("files.imageOmitted")}</span>,
      table: ({ children }) => <div className="markdown-table"><table>{children}</table></div>,
    }}>{file.content}</ReactMarkdown></div>;
  if (file.kind === "json") {
    const formatted = formatJsonText(file.content);
    return <>{formatted === null && <p className="file-notice">{t("files.jsonFallback")}</p>}<pre className="file-raw">{formatted ?? file.content}</pre></>;
  }
  const csv = csvPreview(file.content);
  if (csv.error) return <><p className="file-notice">{t("files.csvFallback")}</p><pre className="file-raw">{file.content}</pre></>;
  return <>{csv.truncated && <p className="file-notice">{t("files.csvLimit")}</p>}
    {csv.rows.length > 0 && <div className="file-csv"><table><caption>{file.filename}</caption><thead><tr>{csv.rows[0].map((cell, i) => <th scope="col" key={i}>{cell}</th>)}</tr></thead>
      <tbody>{csv.rows.slice(1).map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div>}</>;
}

function Viewer({ path }: { path: string }) {
  const { t, locale } = useI18n(), request = useArchiveRequest(`${path}/preview`, parseFilePreview);
  const [source, setSource] = useState(false), [copyStatus, setCopyStatus] = useState<"content" | "link" | "error" | null>(null);
  const file = request.data;
  const error = request.error;
  const message = error?.status === 404 ? "files.notFound" : error?.status === 413 ? "files.tooLarge" : error?.status === 415 ? "files.unsupported" : "files.failed";
  const copy = async (value: string, kind: "content" | "link") => {
    try { await navigator.clipboard.writeText(value); setCopyStatus(kind); }
    catch { setCopyStatus("error"); }
  };
  return <main className="file-viewer"><header className="file-viewer-header"><a href="/workspace" aria-label="MindRails"><Wordmark /></a>
    <div className="file-viewer-title"><h1>{file?.filename ?? t("files.title")}</h1>{file && <p>{file.kind.toUpperCase()} · {formatFileSize(file.bytes, locale)}</p>}</div>
    <div className="file-toolbar">
      {file && file.kind !== "image" && <><Button onClick={() => setSource(value => !value)} aria-pressed={source}>{t(source ? "files.preview" : "files.source")}</Button>
        <Button onClick={() => void copy(file.content, "content")}>{t("files.copyContent")}</Button></>}
      <Button onClick={() => void copy(window.location.href, "link")}>{t("files.copyLink")}</Button>
      <FileDownloadButton href={`${path}/download`} filename={file?.filename ?? "download"} className="ui-button">{t("deliverables.download")}</FileDownloadButton>
    </div></header>
    {copyStatus && <p role="status" className="file-notice">{t(copyStatus === "error" ? "files.copyFailed" : copyStatus === "link" ? "files.linkCopied" : "files.contentCopied")}</p>}
    {request.loading && <p role="status" className="file-status">{t("files.loading")}</p>}
    {error && <div role="alert" className="file-status"><p>{t(message)}</p><Button onClick={request.retry}>{t("assets.retry")}</Button></div>}
    {file && <section aria-label={t(source ? "files.source" : "files.preview")} className="file-viewer-content"><PreviewContent file={file} source={source} path={path} /></section>}
  </main>;
}

export function FileViewer({ path }: { path: string }) {
  const { client, recheck, status } = useBackendConnection(), { t } = useI18n();
  return client ? <Viewer key={`${client.resourceScope}:${path}`} path={path} />
    : <main className="file-viewer"><Wordmark /><div className="file-status" role="status"><p>{t(status === "checking" ? "files.loading" : "files.failed")}</p>
      <Button onClick={() => void recheck()} disabled={status === "checking"}>{t("assets.retry")}</Button></div></main>;
}
