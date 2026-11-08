import { CopyButton } from '@hyperlane-xyz/widgets';
import clsx from 'clsx';
import { useId, useMemo, useState, type ReactNode } from 'react';

import type { Message, MessageStub } from '../../../types';
import { tryUtf8DecodeBytes } from '../../../utils/string';

interface Props {
  message: Message | MessageStub;
  compact?: boolean;
  details?: ReactNode;
  title?: string;
}

export function MessagePayload({ message, compact, details, title = 'Payload' }: Props) {
  return (
    <Payload
      key={message.msgId}
      body={message.body}
      compact={compact}
      details={details}
      title={title}
    />
  );
}

function Payload({
  body,
  compact,
  details,
  title,
}: {
  body: string;
  compact?: boolean;
  details?: ReactNode;
  title: string;
}) {
  const [selectedView, setView] = useState<'hex' | 'text' | 'details'>();
  const hasDetails = !!details;
  // Async decoding may choose the default, but must not replace an explicit view.
  const view =
    selectedView === 'details' && !hasDetails
      ? 'hex'
      : (selectedView ?? (hasDetails ? 'details' : 'hex'));
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const hex = body.replace(/^0x/i, '');
  const validHex = hex.length % 2 === 0 && /^[\da-f]*$/i.test(hex);
  const byteCount = validHex ? hex.length / 2 : undefined;
  const empty = byteCount === 0;
  const text = useMemo(
    () => (view === 'text' && validHex ? tryUtf8DecodeBytes(`0x${hex}`) : undefined),
    [view, validHex, hex],
  );
  // Keep tabs/newlines readable while making otherwise invisible control bytes explicit.
  const display =
    view === 'hex'
      ? body
      : text?.replace(
          // eslint-disable-next-line no-control-regex -- Render invisible payload bytes as explicit escapes.
          /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
          (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, '0')}`,
        );
  const limit = compact ? 256 : 512;
  const truncated = display !== undefined && display.length > limit;
  const visible = expanded ? display : display?.slice(0, limit).replace(/[\uD800-\uDBFF]$/, '');
  const previewNote =
    view === 'text'
      ? `UTF-8 preview; not ABI decoded.${text !== display ? ' Control bytes are escaped.' : ''}`
      : !validHex
        ? 'Payload is not valid hexadecimal data.'
        : undefined;

  return (
    <section
      aria-label="Message payload"
      className="min-w-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-50"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-150/70 px-4 py-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-gray-800">{title}</h3>
          <span className="rounded border border-gray-200 bg-white/70 px-1.5 py-0.5 text-xxs tabular-nums text-gray-500">
            {byteCount === undefined
              ? 'Byte count unavailable'
              : `${byteCount.toLocaleString()} ${byteCount === 1 ? 'byte' : 'bytes'}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <fieldset className="flex rounded-md bg-gray-200/70 p-0.5">
            <legend className="sr-only">Payload view</legend>
            {(['details', 'hex', 'text'] as const)
              .filter((option) => option !== 'details' || hasDetails)
              .map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  aria-controls={contentId}
                  onClick={() => {
                    setView(option);
                    setExpanded(false);
                  }}
                  className={clsx(
                    'rounded px-2 py-1 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500',
                    view === option
                      ? 'bg-white text-primary-800 shadow-sm'
                      : 'text-gray-500 hover:text-gray-800',
                  )}
                >
                  {option === 'hex' ? 'Hex' : option === 'text' ? 'Text' : 'Details'}
                </button>
              ))}
          </fieldset>
          <CopyButton
            copyValue={body}
            aria-label="Copy original payload"
            title="Copy original payload"
            width={13}
            height={13}
            className="rounded p-2 text-gray-500 hover:text-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 [&_rect]:stroke-current [&_path]:fill-current"
          />
        </div>
      </div>
      <div id={contentId} className="p-4">
        {view === 'details' ? (
          details
        ) : empty ? (
          <p className="text-sm text-gray-500">No payload data.</p>
        ) : display === undefined ? (
          <p className="text-sm leading-relaxed text-gray-500">
            No UTF-8 text preview available. This payload may contain binary or encoded data.
          </p>
        ) : (
          <pre
            className={clsx(
              'max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-gray-700',
              compact ? 'text-xs leading-5' : 'text-sm leading-6',
            )}
          >
            <code>
              {visible}
              {truncated && !expanded ? '…' : ''}
            </code>
          </pre>
        )}
      </div>
      {view !== 'details' && (previewNote || truncated) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-3 text-xs text-gray-500">
          {previewNote && <span>{previewNote}</span>}
          {!empty && truncated && (
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={contentId}
              onClick={() => setExpanded(!expanded)}
              className="ml-auto shrink-0 rounded px-1 py-0.5 text-primary-700 hover:text-primary-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
