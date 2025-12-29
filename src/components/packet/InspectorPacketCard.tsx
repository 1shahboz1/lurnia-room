import * as React from "react";

export type PacketType =
  | "DNS_QUERY"
  | "DNS_RESPONSE"
  | "TCP_SYN"
  | "TCP_SYNACK"
  | "TCP_ACK"
  | "TLS_CLIENT_HELLO"
  | "TLS_SERVER_HELLO"
  | "TLS_CERT"
  | "HTTP_REQUEST"
  | "HTTP_RESPONSE"
  | "HTTP_ENCRYPTED";

export interface HTTPDetails {
  statusCode?: number;
  compressed?: boolean;
}

export interface DNSAnswer { address: string; ttl?: number }
export interface DNSDetails {
  qname?: string;
  qtype?: string;
  answers?: DNSAnswer[];
}

export interface MetaDetails {
  ttlSeconds?: number;
  sizeBytes?: number;
  statusText?: string;
}

export interface InspectorPacketCardProps {
  id: string;
  type?: PacketType | string;
  labelPrimary?: string;
  labelSecondary?: string;
  fields?: Record<string, string | number | boolean | undefined>;
  http?: HTTPDetails;
  dns?: DNSDetails;
  meta?: MetaDetails;
}

// Helpers
function formatBytes(n?: number): string {
  if (typeof n !== 'number' || !isFinite(n)) return 'N/A';
  if (n < 1024) return `${n}B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)}MB`;
}

function formatTTL(s?: number): string {
  if (typeof s !== 'number' || !isFinite(s)) return 'N/A';
  return `${Math.round(s)}s`;
}

// Ordered field keys as per spec
const ORDERED_KEYS = [
  'method',
  'path',
  'host',
  'user-agent',
  'src_ip',
  'dst_ip',
  'src_port',
  'dst_port',
];

export default function InspectorPacketCard({
  id,
  type,
  labelPrimary,
  labelSecondary,
  fields = {},
  http,
  dns,
  meta,
}: InspectorPacketCardProps) {
  // Top chips: only render if non-empty
  const encryptedVal = fields?.encrypted as (string | boolean | undefined);
  const protocolVal = fields?.protocol as (string | undefined);
  const flagsVal = fields?.flags as (string | undefined);

  const chips: { label: string; value?: string }[] = [
    { label: 'Type', value: type ? String(type) : undefined },
    { label: 'Encrypted', value: encryptedVal === undefined ? undefined : (String(encryptedVal) === 'true' || String(encryptedVal).toLowerCase() === 'yes' ? 'Yes' : String(encryptedVal)) },
    { label: 'Protocol', value: protocolVal && String(protocolVal) || undefined },
    { label: 'Flags', value: flagsVal && String(flagsVal) || undefined },
  ].filter(c => !!c.value && String(c.value).trim().length > 0);

  // Build ordered + extra fields
  const orderedPairs: { key: string; value: string }[] = [];
  const extras: { key: string; value: string }[] = [];

  const fieldKeys = Object.keys(fields || {});
  const seen = new Set<string>();

  ORDERED_KEYS.forEach(k => {
    if (fieldKeys.includes(k) && fields[k] !== undefined && fields[k] !== '') {
      orderedPairs.push({ key: k, value: String(fields[k]) });
      seen.add(k);
    }
  });

  fieldKeys.forEach(k => {
    if (!seen.has(k) && fields[k] !== undefined && fields[k] !== '') {
      extras.push({ key: k, value: String(fields[k]) });
    }
  });

  // Right panel duplicate host suppression for labelSecondary
  const hostVal = fields?.host ? String(fields.host) : undefined;
  // Show secondary summary even if it duplicates host (matches reference snapshot)
  const showSecondary = !!labelSecondary;

  return (
    <div
      className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6"
      style={{
        backgroundColor: '#ffffff',
        color: '#0f172a',
        borderRadius: '1rem',
        border: '1px solid rgba(226,232,240,1)',
        boxShadow: '0 12px 30px rgba(8,15,30,0.08)'
      }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Network Packet</div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span className="uppercase tracking-wide">Packet ID</span>
            <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-sm font-mono text-slate-700 shadow-sm">{id}</span>
          </div>
        </div>
      </div>

      {/* Top summary chips */}
      {chips.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          {chips.map((c, i) => (
            <div
              key={i}
              className="p-2 rounded-md border text-xs flex items-center justify-between"
              style={{ backgroundColor: 'rgb(248 250 252)', borderColor: 'rgb(241 245 249)' }}
            >
              <div className="text-xs text-slate-500">{c.label}</div>
              <div className="font-medium ml-2 truncate" title={c.value}>{c.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: Fields list */}
        <div className="rounded-md border border-slate-100 bg-white p-3 overflow-auto h-full" style={{ backgroundColor: '#ffffff' }}>
          <div className="text-xs text-slate-500 mb-2">Fields</div>
          {orderedPairs.length === 0 && extras.length === 0 ? (
            <div className="text-xs text-slate-700">No fields available</div>
          ) : (
            <div className="text-xs text-slate-700 space-y-2">
              {[...orderedPairs, ...extras].map((p, i) => (
                <div key={`${p.key}-${i}`} className="flex items-center">
                  <div className="text-slate-500 w-24 shrink-0">{p.key}:</div>
                  <div className="font-medium truncate" title={p.value}>{p.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: protocol / labels / meta */}
        <div className="rounded-md border border-slate-100 bg-white p-3 shadow-sm flex flex-col min-h-[220px] h-full" style={{ backgroundColor: '#ffffff' }}>
          {/* Top area: badges and subtitles */}
          <div className="flex items-center gap-4">
            {labelPrimary && (
              <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold" title={labelPrimary}>{labelPrimary}</span>
            )}
            {showSecondary && (
              <div className="text-lg font-semibold text-slate-900 truncate" title={labelSecondary}>{labelSecondary}</div>
            )}
          </div>

          {/* Center protocol-specific content */}
          <div className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-700 flex-1 overflow-auto">
            {/* HTTP details */}
            {http && (http.statusCode !== undefined || http.compressed !== undefined) && (
              <div className="space-y-1">
                {http.statusCode !== undefined && (
                  <div className="flex items-center gap-2"><span className="text-slate-500">Status:</span><span className="font-medium">{http.statusCode}</span></div>
                )}
                {http.compressed !== undefined && (
                  <div className="flex items-center gap-2"><span className="text-slate-500">Compressed:</span><span className="font-medium">{http.compressed ? 'Yes' : 'N/A'}</span></div>
                )}
              </div>
            )}

            {/* DNS details */}
            {dns && (dns.qname || dns.qtype || (dns.answers && dns.answers.length > 0)) && (
              <div className="space-y-2" aria-live="polite">
                <div className="flex items-center gap-2">
                  {dns.qname && <span className="font-medium" title={dns.qname}>{dns.qname}</span>}
                  {dns.qtype && <span className="text-slate-500">{dns.qtype}</span>}
                </div>
                {dns.answers && dns.answers.length > 0 ? (
                  <div className="space-y-1">
                    {dns.answers.map((a, i) => (
                      <div key={i} className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <span className="font-mono text-[11px] truncate" title={a.address}>{a.address}</span>
                        <span className="text-[11px] text-slate-500">TTL: {formatTTL(a.ttl ?? meta?.ttlSeconds)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-slate-500">Awaiting response</div>
                )}
              </div>
            )}
          </div>

          {/* Footer meta anchored to bottom */}
          <div className="mt-auto grid grid-cols-3 gap-2 text-[11px] text-slate-500">
            <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100">TTL: <span className="font-medium ml-1">{formatTTL(meta?.ttlSeconds)}</span></div>
            <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100">Size: <span className="font-medium ml-1">{formatBytes(meta?.sizeBytes)}</span></div>
            <div className="px-2 py-1 rounded-md bg-slate-50 border border-slate-100">Status: <span className="font-medium ml-1">{meta?.statusText || 'N/A'}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}