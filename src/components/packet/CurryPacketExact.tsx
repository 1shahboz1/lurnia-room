import * as React from "react";

export interface CurryPacketExactProps {
  id?: string;
  type?: string;
  encrypted?: string | boolean;
  protocol?: string;
  flags?: string;
  // Right panel header
  labelPrimary?: string;
  labelSecondary?: string;
  // Fields
  fields?: Partial<{
    method: string;
    path: string;
    host: string;
    "user-agent": string;
    src_ip: string;
    dst_ip: string;
    src_port: string | number;
    dst_port: string | number;
  }>;
  // Meta
  ttlSeconds?: number;
  sizeBytes?: number;
  statusText?: string;
}

export default function CurryPacketExact({
  id = "pkt-2",
  type = "HTTP_REQUEST",
  encrypted = "Yes",
  protocol = "TCP",
  flags = "SYN,ACK",
  labelPrimary = "HTTP GET",
  labelSecondary = "Host: example.com",
  fields = {
    method: "GET",
    path: "/",
    host: "example.com",
    "user-agent": "demo-client/1.0",
    src_ip: "192.168.1.10",
    dst_ip: "93.184.216.34",
    src_port: 52344,
    dst_port: 80,
  },
  ttlSeconds = 300,
  sizeBytes = 15360,
  statusText = "200",
}: CurryPacketExactProps) {
  const fmtBytes = (n?: number) => {
    if (typeof n !== 'number' || !isFinite(n)) return '';
    if (n < 1024) return `${n} B`;
    const kb = n / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  return (
    <div className="bg-white text-slate-900 rounded-2xl shadow-lg border border-slate-200 p-6" style={{ width: 760, maxWidth: '100%' }}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-2xl font-semibold text-slate-900">Network Packet</div>
        </div>
        <div className="text-xs text-slate-500 flex items-center gap-2">
          <span className="uppercase tracking-wide">Packet ID</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-sm font-mono text-slate-700 shadow-sm">{id}</span>
        </div>
      </div>

      {/* Top summary chips */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6">
        <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
          <div className="text-xs text-slate-500">Type</div>
          <div className="font-medium ml-2">{type}</div>
        </div>
        <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
          <div className="text-xs text-slate-500">Encrypted</div>
          <div className="font-medium ml-2">{String(encrypted)}</div>
        </div>
        <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
          <div className="text-xs text-slate-500">Protocol</div>
          <div className="font-medium ml-2">{protocol}</div>
        </div>
        <div className="p-2 rounded-md bg-slate-50 border border-slate-100 text-xs flex items-center justify-between">
          <div className="text-xs text-slate-500">Flags</div>
          <div className="font-medium ml-2">{flags}</div>
        </div>
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left fields card */}
        <div className="rounded-md border border-slate-100 bg-white p-6">
          <div className="text-slate-500 text-sm mb-4">Fields</div>
          <div className="space-y-4 text-slate-700">
            <div><span className="text-slate-500">method:</span> <span className="font-medium">{fields.method}</span></div>
            <div><span className="text-slate-500">path:</span> <span className="font-medium">{fields.path}</span></div>
            <div><span className="text-slate-500">host:</span> <span className="font-medium">{fields.host}</span></div>
            <div><span className="text-slate-500">user-agent:</span> <span className="font-medium">{fields["user-agent"]}</span></div>
            <div><span className="text-slate-500">src_ip:</span> <span className="font-medium">{fields.src_ip}</span></div>
            <div><span className="text-slate-500">dst_ip:</span> <span className="font-medium">{fields.dst_ip}</span></div>
            <div><span className="text-slate-500">src_port:</span> <span className="font-medium">{fields.src_port}</span></div>
            <div><span className="text-slate-500">dst_port:</span> <span className="font-medium">{fields.dst_port}</span></div>
          </div>
        </div>

        {/* Right detail panel */}
        <div className="rounded-md border border-slate-100 bg-white p-6 shadow-sm flex flex-col min-h-[220px]">
          <div className="flex items-center gap-4">
            <span className="px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-semibold">{labelPrimary}</span>
            <div className="text-lg font-semibold text-slate-900">{labelSecondary}</div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-6"></div>

          {/* Footer meta */}
          <div className="mt-auto grid grid-cols-3 gap-3 text-[13px] text-slate-600">
            <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-100">TTL: <span className="font-medium ml-1">{ttlSeconds}s</span></div>
            <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-100">Size: <span className="font-medium ml-1">{fmtBytes(sizeBytes)}</span></div>
            <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-100">Status: <span className="font-medium ml-1">{statusText}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}